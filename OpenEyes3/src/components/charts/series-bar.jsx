"use client";;
import { motion } from "motion/react";
import { useMemo } from "react";
import { chartCssVars, useChart } from "./chart-context";
import { useChartLegendHover } from "./chart-legend-hover";
import { transitionWithDelay } from "./motion-utils";
import { computeSeriesBarWidth } from "./series-bar-layout";

function computeSeriesBarLayout(input) {
  const {
    stacked,
    composedStackOffsets,
    rowIndex,
    dataKey,
    value,
    yScale,
    innerHeight,
    xCenter,
    barWidth,
    seriesCount,
    gap,
    seriesIndex,
    stackGap,
    isLastSeries,
    radius,
  } = input;

  if (stacked && composedStackOffsets) {
    const offset = composedStackOffsets.get(rowIndex)?.get(dataKey) ?? 0;
    const valuePos = yScale(value) ?? 0;
    let barHeight = innerHeight - valuePos;
    const offsetY = yScale(offset) ?? innerHeight;
    const gapOffset = seriesIndex * stackGap;
    const valueY = offsetY - barHeight - gapOffset;
    if (!isLastSeries && stackGap > 0) {
      barHeight = Math.max(0, barHeight - stackGap);
    }
    const barLeft = xCenter - barWidth / 2;
    const applyRounding = stackGap > 0 || isLastSeries;
    return {
      barLeft,
      barHeight,
      effectiveRadius: applyRounding ? radius : 0,
      valueY,
    };
  }

  const groupWidth =
    seriesCount * barWidth + (seriesCount > 1 ? (seriesCount - 1) * gap : 0);
  const valueY = yScale(value) ?? innerHeight;
  return {
    barLeft: xCenter - groupWidth / 2 + seriesIndex * (barWidth + gap),
    barHeight: innerHeight - valueY,
    effectiveRadius: radius,
    valueY,
  };
}

export function SeriesBar({
  dataKey,
  fill = chartCssVars.linePrimary,
  radius = 0,
  animate = true,
  fadedOpacity = 0.3
}) {
  const {
    data,
    xScale,
    yScale,
    xAccessor,
    innerHeight,
    innerWidth,
    columnWidth,
    isLoaded,
    animationDuration,
    enterTransition,
    revealEpoch = 0,
    barScale,
    composedBarDataKeys,
    composedBarSize,
    composedMaxBarSize,
    composedBarGap,
    composedStacked,
    composedStackOffsets,
    composedStackGap,
    tooltipData,
  } = useChart();

  const barKeys = useMemo(() => {
    if (composedBarDataKeys && composedBarDataKeys.length > 0) {
      return composedBarDataKeys;
    }
    return [dataKey];
  }, [composedBarDataKeys, dataKey]);

  const seriesIndex = useMemo(() => {
    const idx = barKeys.indexOf(dataKey);
    return idx >= 0 ? idx : 0;
  }, [barKeys, dataKey]);

  const n = barKeys.length;
  const gap = composedBarGap ?? 4;
  const stackGap = composedStackGap ?? 0;

  const stacked =
    Boolean(composedStacked) &&
    composedStackOffsets != null &&
    composedBarDataKeys != null &&
    composedBarDataKeys.length > 0;

  const isLastSeries = seriesIndex === n - 1;

  const barWidth = useMemo(() =>
    computeSeriesBarWidth({
      innerWidth,
      dataLength: data.length,
      columnWidth,
      seriesCount: n,
      composedBarSize,
      composedMaxBarSize,
      composedBarGap: gap,
      stacked,
    }), [
    columnWidth,
    composedBarSize,
    composedMaxBarSize,
    data.length,
    gap,
    innerWidth,
    n,
    stacked,
  ]);

  const totalAnimDuration = animationDuration || 1100;
  const staggerSpread = totalAnimDuration * 0.4;
  const calculatedStaggerDelay =
    data.length > 1 ? staggerSpread / 1000 / data.length : 0;
  const { hoveredIndex: legendHoveredIndex } = useChartLegendHover();
  const isLegendDimmed =
    legendHoveredIndex !== null && legendHoveredIndex !== seriesIndex;
  const hoveredIndex = tooltipData?.index ?? null;

  if (barScale) {
    console.warn(
      "SeriesBar is for time-based ComposedChart / LineChart context. Use Bar inside BarChart for categorical x."
    );
    return null;
  }

  return (
    <g className="series-bar">
      {data.map((d, i) => {
        const value = d[dataKey];
        if (typeof value !== "number") {
          return null;
        }

        const xCenter = xScale(xAccessor(d)) ?? 0;

        const { barLeft, valueY, barHeight, effectiveRadius } =
          computeSeriesBarLayout({
            stacked,
            composedStackOffsets,
            rowIndex: i,
            dataKey,
            value,
            yScale,
            innerHeight,
            xCenter,
            barWidth,
            seriesCount: n,
            gap,
            seriesIndex,
            stackGap,
            isLastSeries,
            radius,
          });

        const categoryLabel = String(xAccessor(d).getTime());
        const isFaded =
          (hoveredIndex !== null && hoveredIndex !== i) || isLegendDimmed;

        if (animate && !isLoaded) {
          return (
            <SeriesBarRect
              barHeight={barHeight}
              barWidth={barWidth}
              calculatedStaggerDelay={calculatedStaggerDelay}
              enterTransition={enterTransition}
              fadedOpacity={fadedOpacity}
              fill={fill}
              index={i}
              innerHeight={innerHeight}
              isFaded={isFaded}
              key={`${dataKey}-${categoryLabel}-${revealEpoch}`}
              radius={effectiveRadius}
              revealEpoch={revealEpoch}
              x={barLeft}
              y={valueY} />
          );
        }

        return (
          <motion.rect
            animate={{ opacity: isFaded ? fadedOpacity : 1 }}
            fill={fill}
            height={barHeight}
            key={`${dataKey}-${categoryLabel}`}
            rx={effectiveRadius}
            ry={effectiveRadius}
            transition={{ opacity: { duration: 0.12 } }}
            width={barWidth}
            x={barLeft}
            y={valueY} />
        );
      })}
    </g>
  );
}

SeriesBar.displayName = "SeriesBar";

function SeriesBarRect({
  x,
  y,
  barWidth,
  barHeight,
  fill,
  radius,
  index,
  innerHeight,
  calculatedStaggerDelay,
  enterTransition,
  revealEpoch,
  isFaded,
  fadedOpacity
}) {
  const enterAnim = transitionWithDelay(enterTransition, index * calculatedStaggerDelay);

  return (
    <motion.rect
      animate={{
        height: barHeight,
        y,
        opacity: isFaded ? fadedOpacity : 1,
      }}
      fill={fill}
      initial={{ height: 0, y: innerHeight, opacity: 1 }}
      key={`series-bar-${index}-${revealEpoch}`}
      rx={radius}
      ry={radius}
      transition={enterAnim}
      width={barWidth}
      x={x} />
  );
}

export default SeriesBar;
