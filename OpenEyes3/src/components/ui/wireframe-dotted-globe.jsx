import { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'

export default function RotatingEarth({ width = 720, height = 560, className = '' }) {
  const canvasRef = useRef(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined
    const context = canvas.getContext('2d')
    if (!context) return undefined

    let disposed = false
    let landFeatures = null
    const allDots = []
    const rotation = [0, 0]
    let autoRotate = true
    let containerWidth = width
    let containerHeight = height
    let radius = 0
    let projection
    let path
    let rotationTimer

    const pointInPolygon = (point, polygon) => {
      const [x, y] = point
      let inside = false
      for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const [xi, yi] = polygon[i]
        const [xj, yj] = polygon[j]
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
      }
      return inside
    }

    const pointInFeature = (point, feature) => {
      const geometry = feature.geometry
      if (geometry.type === 'Polygon') {
        const rings = geometry.coordinates
        if (!pointInPolygon(point, rings[0])) return false
        return !rings.slice(1).some((ring) => pointInPolygon(point, ring))
      }
      if (geometry.type === 'MultiPolygon') {
        return geometry.coordinates.some((polygon) => {
          if (!pointInPolygon(point, polygon[0])) return false
          return !polygon.slice(1).some((ring) => pointInPolygon(point, ring))
        })
      }
      return false
    }

    const generateDotsInPolygon = (feature, dotSpacing = 16) => {
      const dots = []
      const [[minLng, minLat], [maxLng, maxLat]] = d3.geoBounds(feature)
      const stepSize = dotSpacing * 0.08
      for (let lng = minLng; lng <= maxLng; lng += stepSize) {
        for (let lat = minLat; lat <= maxLat; lat += stepSize) {
          const point = [lng, lat]
          if (pointInFeature(point, feature)) dots.push(point)
        }
      }
      return dots
    }

    const setup = () => {
      containerWidth = Math.min(width, Math.max(280, window.innerWidth - 32))
      containerHeight = Math.min(height, Math.max(280, window.innerHeight - 180))
      radius = Math.min(containerWidth, containerHeight) / 2.45
      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.round(containerWidth * dpr)
      canvas.height = Math.round(containerHeight * dpr)
      canvas.style.width = `${containerWidth}px`
      canvas.style.height = `${containerHeight}px`
      context.setTransform(dpr, 0, 0, dpr, 0, 0)

      projection = d3.geoOrthographic()
        .scale(radius)
        .translate([containerWidth / 2, containerHeight / 2])
        .clipAngle(90)
      path = d3.geoPath().projection(projection).context(context)
    }

    const render = () => {
      if (!projection || disposed) return
      context.clearRect(0, 0, containerWidth, containerHeight)
      const currentScale = projection.scale()
      const scaleFactor = currentScale / radius
      const cx = containerWidth / 2
      const cy = containerHeight / 2

      context.save()
      context.beginPath()
      context.arc(cx, cy, currentScale, 0, Math.PI * 2)
      context.fillStyle = '#000'
      context.fill()
      context.strokeStyle = 'rgba(255,255,255,.72)'
      context.lineWidth = Math.max(1, 1.4 * scaleFactor)
      context.stroke()

      if (landFeatures) {
        const graticule = d3.geoGraticule()
        context.beginPath()
        path(graticule())
        context.strokeStyle = 'rgba(255,255,255,.12)'
        context.lineWidth = Math.max(.5, .8 * scaleFactor)
        context.stroke()

        context.beginPath()
        landFeatures.features.forEach((feature) => path(feature))
        context.strokeStyle = 'rgba(255,255,255,.6)'
        context.lineWidth = Math.max(.6, 1 * scaleFactor)
        context.stroke()

        allDots.forEach((dot) => {
          const projected = projection([dot.lng, dot.lat])
          if (!projected) return
          const dx = projected[0] - cx
          const dy = projected[1] - cy
          if (dx * dx + dy * dy > currentScale * currentScale) return
          context.beginPath()
          context.arc(projected[0], projected[1], Math.max(.65, 1.05 * scaleFactor), 0, Math.PI * 2)
          context.fillStyle = 'rgba(255,255,255,.68)'
          context.fill()
        })
      }
      context.restore()
    }

    const handleResize = () => {
      setup()
      render()
    }

    const handlePointerDown = (event) => {
      autoRotate = false
      canvas.setPointerCapture?.(event.pointerId)
      const startX = event.clientX
      const startY = event.clientY
      const startRotation = [...rotation]
      const sensitivity = 0.45

      const move = (moveEvent) => {
        rotation[0] = startRotation[0] + (moveEvent.clientX - startX) * sensitivity
        rotation[1] = Math.max(-80, Math.min(80, startRotation[1] - (moveEvent.clientY - startY) * sensitivity))
        projection.rotate(rotation)
        render()
      }
      const up = () => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        window.setTimeout(() => { autoRotate = true }, 250)
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
    }

    const handleWheel = (event) => {
      event.preventDefault()
      const factor = event.deltaY > 0 ? 0.9 : 1.1
      projection.scale(Math.max(radius * 0.55, Math.min(radius * 2.1, projection.scale() * factor)))
      render()
    }

    const loadWorldData = async () => {
      try {
        setIsLoading(true)
        const response = await fetch('https://raw.githubusercontent.com/martynafford/natural-earth-geojson/refs/heads/master/110m/physical/ne_110m_land.json')
        if (!response.ok) throw new Error('Failed to load land data')
        landFeatures = await response.json()
        if (disposed) return
        landFeatures.features.forEach((feature) => {
          generateDotsInPolygon(feature, 16).forEach(([lng, lat]) => allDots.push({ lng, lat }))
        })
        render()
        setIsLoading(false)
      } catch (err) {
        if (disposed) return
        setError('Failed to load land map data')
        setIsLoading(false)
      }
    }

    setup()
    render()
    rotationTimer = d3.timer(() => {
      if (!autoRotate || disposed) return
      rotation[0] += 0.16
      projection.rotate(rotation)
      render()
    })

    canvas.addEventListener('pointerdown', handlePointerDown)
    canvas.addEventListener('wheel', handleWheel, { passive: false })
    window.addEventListener('resize', handleResize)
    loadWorldData()

    return () => {
      disposed = true
      rotationTimer?.stop()
      canvas.removeEventListener('pointerdown', handlePointerDown)
      canvas.removeEventListener('wheel', handleWheel)
      window.removeEventListener('resize', handleResize)
    }
  }, [width, height])

  if (error) {
    return <div className={`globe-error ${className}`}><span>{error}</span></div>
  }

  return (
    <div className={`wireframe-globe ${className}`}>
      <canvas ref={canvasRef} aria-label="Interactive rotating dotted globe" />
      <div className="wireframe-globe-hint">
        <span>{isLoading ? 'LOADING WORLD DATA' : 'DRAG TO ROTATE'}</span>
        <span>SCROLL TO ZOOM</span>
      </div>
    </div>
  )
}
