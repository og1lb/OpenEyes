"use client";;
import { ParentSize } from "@visx/responsive";
import { Children, isValidElement, useMemo, useRef } from "react";
import { cn } from "@/lib/utils";
import { Area } from "./area";
import { Line } from "./line";
import { SeriesBar } from "./series-bar";
import { TimeSeriesChartInner } from "./time-series-chart-shell";

const DEFAULT_MARGIN = { top: 40, right: 40, bottom: 40, left: 40 };

function getChildComponentName(child) {
  const childType = child.type;
  return typeof child.type === "function"
    ? childType.displayName || childType.name || ""
    : "";
}

function upsertLineConfig(lines, config) {
  const index = lines.findIndex((line) => line.dataKey === config.dataKey);
  if (index === -1) {
    lines.push(config);
    return;
  }
  // Area+Line pairs share a dataKey — keep the later config (Line over Area).
  lines[index] = config;
}

function tryAppendSeriesBar(child, lines, barDataKeys) {
  const name = getChildComponentName(child);
  if (!(child.type === SeriesBar || name === "SeriesBar")) {
    return false;
  }
  const props = child.props;
  if (!props.dataKey) {
    return true;
  }
  barDataKeys.push(props.dataKey);
  upsertLineConfig(lines, {
    dataKey: props.dataKey,
    stroke: props.stroke || props.fill || "var(--chart-line-primary)",
    strokeWidth: 0,
  });
  return true;
}

function tryAppendLine(child, lines) {
  const name = getChildComponentName(child);
  if (!(child.type === Line || name === "Line")) {
    return false;
  }
  const props = child.props;
  if (props.dataKey) {
    upsertLineConfig(lines, {
      dataKey: props.dataKey,
      stroke: props.stroke || "var(--chart-line-primary)",
      strokeWidth: props.strokeWidth ?? 2.5,
      yAxisId: props.yAxisId,
    });
  }
  return true;
}

function tryAppendArea(child, lines) {
  const name = getChildComponentName(child);
  if (!(child.type === Area || name === "Area")) {
    return false;
  }
  const props = child.props;
  if (props.dataKey) {
    upsertLineConfig(lines, {
      dataKey: props.dataKey,
      stroke: props.stroke || props.fill || "var(--chart-line-primary)",
      strokeWidth: props.strokeWidth ?? 2,
      yAxisId: props.yAxisId,
    });
  }
  return true;
}

function extractComposedSeries(children) {
  const lines = [];
  const barDataKeys = [];

  Children.forEach(children, (child) => {
    if (!isValidElement(child)) {
      return;
    }
    if (tryAppendSeriesBar(child, lines, barDataKeys)) {
      return;
    }
    if (tryAppendLine(child, lines)) {
      return;
    }
    tryAppendArea(child, lines);
  });

  return { lines, barDataKeys };
}

function computeComposedYScaleDomainMax(data, lines, barDataKeys) {
  const barSet = new Set(barDataKeys);
  let max = 0;
  for (const d of data) {
    let barSum = 0;
    for (const k of barDataKeys) {
      const v = d[k];
      if (typeof v === "number") {
        barSum += v;
      }
    }
    let rowMaxOther = 0;
    for (const line of lines) {
      if (barSet.has(line.dataKey)) {
        continue;
      }
      const v = d[line.dataKey];
      if (typeof v === "number") {
        rowMaxOther = Math.max(rowMaxOther, v);
      }
    }
    max = Math.max(max, barSum, rowMaxOther);
  }
  return max > 0 ? max : undefined;
}

function ChartInner({
  width,
  height,
  data,
  xDataKey,
  margin,
  animationDuration,
  animationEasing,
  enterTransition,
  revealSignature,
  children,
  containerRef,
  barSize,
  maxBarSize,
  barGap,
  stacked = false,
  stackGap = 0,
  onPhaseChange
}) {
  const { lines, barDataKeys } = useMemo(() => extractComposedSeries(children), [children]);

  const composedStackOffsets = useMemo(() => {
    if (!(stacked && barDataKeys.length > 0)) {
      return undefined;
    }
    const offsets = new Map();
    for (let i = 0; i < data.length; i++) {
      const d = data[i];
      if (!d) {
        continue;
      }
      const pointOffsets = new Map();
      let cumulative = 0;
      for (const key of barDataKeys) {
        pointOffsets.set(key, cumulative);
        const v = d[key];
        if (typeof v === "number") {
          cumulative += v;
        }
      }
      offsets.set(i, pointOffsets);
    }
    return offsets;
  }, [data, barDataKeys, stacked]);

  const yScaleDomainMax = useMemo(() =>
    stacked && barDataKeys.length > 0
      ? computeComposedYScaleDomainMax(data, lines, barDataKeys)
      : undefined, [data, lines, barDataKeys, stacked]);

  return (
    <TimeSeriesChartInner
      animationDuration={animationDuration}
      animationEasing={animationEasing}
      clipPathId="composed-chart-grow-clip"
      composedBarDataKeys={barDataKeys.length > 0 ? barDataKeys : undefined}
      composedBarGap={barGap}
      composedBarSize={barSize}
      composedMaxBarSize={maxBarSize}
      composedStacked={stacked}
      composedStackGap={stackGap}
      composedStackOffsets={composedStackOffsets}
      containerRef={containerRef}
      data={data}
      enterTransition={enterTransition}
      height={height}
      lines={lines}
      margin={margin}
      onPhaseChange={onPhaseChange}
      revealSignature={revealSignature}
      width={width}
      xDataKey={xDataKey}
      yScaleDomainMax={yScaleDomainMax}>
      {children}
    </TimeSeriesChartInner>
  );
}

export function ComposedChart({
  data,
  xDataKey = "date",
  margin: marginProp,
  animationDuration = 1100,
  animationEasing,
  enterTransition,
  revealSignature,
  aspectRatio = "2 / 1",
  className = "",
  children,
  barSize,
  maxBarSize,
  barGap = 4,
  stacked = false,
  stackGap = 0,
  onPhaseChange
}) {
  const containerRef = useRef(null);
  const margin = { ...DEFAULT_MARGIN, ...marginProp };

  return (
    <div
      className={cn("relative w-full", className)}
      ref={containerRef}
      style={{ aspectRatio, touchAction: "none" }}>
      <ParentSize debounceTime={10}>
        {({ width, height }) => (
          <ChartInner
            animationDuration={animationDuration}
            animationEasing={animationEasing}
            barGap={barGap}
            barSize={barSize}
            containerRef={containerRef}
            data={data}
            enterTransition={enterTransition}
            height={height}
            margin={margin}
            maxBarSize={maxBarSize}
            onPhaseChange={onPhaseChange}
            revealSignature={revealSignature}
            stacked={stacked}
            stackGap={stackGap}
            width={width}
            xDataKey={xDataKey}>
            {children}
          </ChartInner>
        )}
      </ParentSize>
    </div>
  );
}

ComposedChart.displayName = "ComposedChart";

export default ComposedChart;
