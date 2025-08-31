// Fully revised Split with container-resize redistribution and nested min-size propagation
// Comments: English only (per user preference)

import React, {
  Children,
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { cn } from '@tgim/utils/index';

// ---- Types ---------------------------------------------------------------
export type Axis = 'horizontal' | 'vertical';

export interface SplitPanelProps {
  size?: number; // fixed size (px), translated to % initially
  initialSize?: number; // preferred initial size (px)
  minSize?: number; // px
  maxSize?: number; // px (Infinity if omitted)
  hidden?: boolean;
  canHidden?: boolean;
  hiddenSize?: number; // px at which it becomes hidden threshold
  onSizeChange?: (px: number) => void;
  onHidden?: (hidden: boolean) => void;
  style?: React.CSSProperties;
  children?: React.ReactNode;

  // internal wiring for nested Split → parent SplitPanel → parent Split
  __onIntrinsicMinChange?: (px: number) => void; // report intrinsic min in parent's axis
  __parentAxis?: 'width' | 'height'; // which axis the parent cares about
}

export interface SplitProps {
  position: Axis; // 'horizontal' uses width as main axis, 'vertical' uses height
  className?: string;
  splitterClassName?: string;
  children: (api: { Panel: React.FC<SplitPanelProps> }) => React.ReactNode;
  splitterSize?: number; // px thickness of the splitter handle (for intrinsic min math)
  // internal (for nested propagation):
  __onIntrinsicMinChange?: (px: number) => void;
  __parentAxis?: 'width' | 'height';
}

export interface SplitterProps {
  index: number;
  size: number;
  position: Axis;
  onResize: (leftIdx: number, rightIdx: number, deltaPx: number, isEnd?: boolean) => void;
  className?: string;
}

const isSplitPanelEl = (el: React.ReactElement<any>) =>
  (el.type as any) === SplitPanel || (el.type as any)?.displayName === 'SplitPanel';

function collectPanelsAtFirstDepth(nodes: React.ReactNode): React.ReactElement<SplitPanelProps>[] {
  // start from the current children level
  let level = React.Children.toArray(nodes).filter(React.isValidElement) as React.ReactElement[];
  const result: React.ReactElement<SplitPanelProps>[] = [];
  while (level.length > 0) {
    const nextLevel: React.ReactElement[] = [];
    for (const el of level) {
      if (isSplitPanelEl(el)) {
        if (!(el.props as SplitPanelProps).hidden) {
          result.push(el as React.ReactElement<SplitPanelProps>);
        }
        continue;
      }
      const children = (el.props as any)?.children;
      if (!children) continue;
      const arr = React.Children.toArray(children).filter(
        React.isValidElement,
      ) as React.ReactElement[];
      nextLevel.push(...arr);
    }
    level = nextLevel;
  }
  return result;
}

// ---- Component -----------------------------------------------------------
export const Split = forwardRef<HTMLDivElement, SplitProps>(
  (
    {
      className,
      position,
      children,
      splitterClassName,
      splitterSize = 6,
      __onIntrinsicMinChange,
      __parentAxis,
      ...props
    },
    ref,
  ) => {
    const rendered = children({ Panel: SplitPanel });

    const panels = React.useMemo(() => {
      return collectPanelsAtFirstDepth(rendered);
    }, [rendered]);
    const containerRef = useRef<HTMLDivElement | null>(null);

    // panel sizes in % of container main axis
    const [sizes, setSizes] = useState<number[]>([]);
    const [hiddens, setHiddens] = useState<boolean[]>([]);

    // dynamic intrinsic mins reported from nested Splits (px)
    const [intrinsicMins, setIntrinsicMins] = useState<number[]>([]);

    // merge external ref and internal containerRef
    const mergedRef = useCallback(
      (node: HTMLDivElement | null) => {
        containerRef.current = node;
        if (typeof ref === 'function') ref(node);
        else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
      },
      [ref],
    );

    // helper to update a single panel's intrinsic min
    const updateIntrinsicMin = useCallback(
      (idx: number, px: number) => {
        setIntrinsicMins(prev => {
          // Guard: if nothing actually changed, keep the same reference to avoid re-renders.
          if (prev.length === panels.length && prev[idx] === px) return prev;

          // Otherwise create/resize the array and write the new value.
          const next = prev.length === panels.length ? [...prev] : Array(panels.length).fill(0);
          next[idx] = px;
          return next;
        });
      },
      [panels.length],
    );

    // initial sizing from props
    const getInitialSize = useCallback(
      (list: React.ReactElement<SplitPanelProps>[]): number[] | undefined => {
        if (list.length === 0 || !containerRef.current) return;

        const containerSize =
          position === 'horizontal'
            ? containerRef.current.clientWidth
            : containerRef.current.clientHeight;

        if (!containerSize) return;

        // read desired size for each panel -> to %
        const initialSizes = list.map(child => {
          const currentSizePx = child.props.size;
          const initialPx = child.props.initialSize;
          if (currentSizePx != null) return (currentSizePx * 100) / containerSize;
          return initialPx != null ? (initialPx * 100) / containerSize : null;
        });

        // clamp helper with min/max
        const clamp = (pct: number, child: React.ReactElement<SplitPanelProps>) => {
          const minPct = ((child.props.minSize ?? 0) / containerSize) * 100;
          const maxPct = ((child.props.maxSize ?? containerSize) / containerSize) * 100;
          return Math.min(Math.max(pct, minPct), maxPct);
        };

        const [sum, cnt] = initialSizes.reduce<[number, number]>(
          ([s, c], v) => (v != null ? [s + (v as number), c + 1] : [s, c]),
          [0, 0],
        );

        if (sum >= 100 && cnt === list.length) {
          // if all panels specify sizes and overflow 100, just clamp
          return initialSizes.map((v, i) => clamp(v as number, list[i]));
        }

        const rest = list.length - cnt;
        const sizePerPanel = rest > 0 ? (100 - sum) / rest : 0;

        return initialSizes.map((v, i) => {
          const raw = v != null ? (v as number) : sizePerPanel;
          return clamp(raw, list[i]);
        });
      },
      [position],
    );

    // initialize on mount / panel count change
    useEffect(() => {
      const newSizes = getInitialSize(panels);
      if (newSizes) setSizes(newSizes);
      setHiddens(Array(panels.length).fill(false));
      setIntrinsicMins(Array(panels.length).fill(0));
    }, [panels.length]);

    // ---- Drag-resize handler ------------------------------------------------
    const handleResize = useCallback(
      (leftIdx: number, rightIdx: number, deltaPx: number, isEnd?: boolean) => {
        if (!containerRef.current) return;

        const containerSize =
          position === 'horizontal'
            ? containerRef.current.clientWidth
            : containerRef.current.clientHeight;
        if (containerSize === 0) return;

        const deltaPercent = (deltaPx / containerSize) * 100;
        const newSizes = [...sizes];

        const leftPanel = panels[leftIdx];
        const rightPanel = panels[rightIdx];

        const getLimits = (panel: React.ReactElement<SplitPanelProps>, idx: number) => ({
          min: (Math.max(panel.props.minSize ?? 0, intrinsicMins[idx] ?? 0) / containerSize) * 100,
          max: ((panel.props.maxSize ?? containerSize) / containerSize) * 100,
          hidden: panel.props.canHidden ?? false,
          hiddenSize: ((panel.props.hiddenSize ?? panel.props.minSize ?? 0) / containerSize) * 100,
        });

        const leftLimits = getLimits(leftPanel, leftIdx);
        const rightLimits = getLimits(rightPanel, rightIdx);

        let newLeft = newSizes[leftIdx] + deltaPercent;
        let newRight = newSizes[rightIdx] - deltaPercent;

        // handle hiding thresholds (left)
        if (leftLimits.hidden && newLeft < leftLimits.hiddenSize) {
          if (isEnd) {
            setHiddens(Array(panels.length).fill(false));
            leftPanel.props.onSizeChange?.((leftLimits.min * containerSize) / 100);
            leftPanel.props.onHidden?.(true);
          } else {
            setHiddens(prev => prev.map((h, i) => (i === leftIdx ? true : h)));
          }
          return;
        } else {
          setHiddens(prev => prev.map((h, i) => (i === leftIdx ? false : h)));
        }

        // handle hiding thresholds (right)
        if (rightLimits.hidden && newRight < rightLimits.hiddenSize) {
          if (isEnd) {
            setHiddens(Array(panels.length).fill(false));
            rightPanel.props.onSizeChange?.((rightLimits.min * containerSize) / 100);
            rightPanel.props.onHidden?.(true);
          } else {
            setHiddens(prev => prev.map((h, i) => (i === rightIdx ? true : h)));
          }
          return;
        } else {
          setHiddens(prev => prev.map((h, i) => (i === rightIdx ? false : h)));
        }

        if (isEnd) {
          leftPanel.props.onSizeChange?.((newLeft * containerSize) / 100);
          rightPanel.props.onSizeChange?.((newRight * containerSize) / 100);
        }

        // clamp against min/max
        if (newLeft < leftLimits.min || newRight < rightLimits.min) return;
        if (newLeft > leftLimits.max || newRight > rightLimits.max) return;

        newSizes[leftIdx] = newLeft;
        newSizes[rightIdx] = newRight;
        setSizes(newSizes);
      },
      [sizes, panels, position, intrinsicMins],
    );

    // ---- Container resize → water-filling redistribution ------------------
    const rebalanceToFit = useCallback((pxSizes: number[], minPx: number[], maxPx: number[]) => {
      // initial clamp
      let s = pxSizes.map((v, i) => {
        const clamped = Math.min(Math.max(v, minPx[i]), isFinite(maxPx[i]) ? maxPx[i] : v);
        return clamped;
      });

      const target = pxSizes.reduce((a, b) => a + b, 0);
      const sum = s.reduce((a, b) => a + b, 0);
      const minSum = minPx.reduce((a, b) => a + b, 0);

      // if even the mins do not fit, normalize mins proportionally
      if (minSum > target) {
        return minPx.map(m => (m / minSum) * target);
      }

      if (Math.abs(sum - target) < 0.5) return s;

      if (sum > target) {
        // shrink: largest-first, not below min
        let over = sum - target;
        const idxs = s.map((_, i) => i).sort((a, b) => s[b] - s[a]);
        for (const i of idxs) {
          const canGive = s[i] - minPx[i];
          const take = Math.min(canGive, over);
          if (take > 0) {
            s[i] -= take;
            over -= take;
          }
          if (over <= 0) break;
        }
      } else {
        // grow: smallest-first, not above max
        let under = target - sum;
        const idxs = s.map((_, i) => i).sort((a, b) => s[a] - s[b]);
        for (const i of idxs) {
          const cap = isFinite(maxPx[i]) ? maxPx[i] : Infinity;
          const canTake = Math.max(0, cap - s[i]);
          const add = Math.min(canTake, under);
          if (add > 0) {
            s[i] += add;
            under -= add;
          }
          if (under <= 0) break;
        }
      }
      return s;
    }, []);

    useEffect(() => {
      const el = containerRef.current;
      if (!el || sizes.length === 0) return;

      const ro = new ResizeObserver(entries => {
        const cr = entries[0]?.contentRect;
        if (!cr) return;
        const newSize = position === 'horizontal' ? cr.width : cr.height;
        if (!newSize) return;

        setSizes(prevPct => {
          if (prevPct.length !== panels.length) return prevPct;

          // % → px
          const pxSizes = prevPct.map(p => (p / 100) * newSize);

          // effective min/max merging declared and dynamic intrinsic
          const limits = panels.map((child, i) => {
            const declaredMin = child.props.minSize ?? 0;
            const declaredMax = child.props.maxSize ?? Infinity;
            const dynMin = intrinsicMins[i] ?? 0;
            return { min: Math.max(declaredMin, dynMin), max: declaredMax };
          });

          const minPx = limits.map(l => l.min);
          const maxPx = limits.map(l => l.max);

          const adjustedPx = rebalanceToFit(pxSizes, minPx, maxPx);
          return adjustedPx.map(px => (px / newSize) * 100);
        });
      });

      ro.observe(el);
      return () => ro.disconnect();
      // exclude sizes from deps to avoid feedback loop, intrinsicMins changes should trigger recalculation
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [position, panels.length, rebalanceToFit, intrinsicMins.join(',')]);

    // ---- If I'm a nested Split, compute and report my intrinsic min --------
    useEffect(() => {
      if (!__onIntrinsicMinChange || !__parentAxis) return;
      const el = containerRef.current;
      if (!el) return;
      const containerSize = position === 'horizontal' ? el.clientWidth : el.clientHeight;

      // gather each child's effective min in my axis (px): declared vs deeper nest
      const childMinsPx = panels.map((child, i) => {
        const declared = child.props.minSize ?? 0;
        const dyn = intrinsicMins[i] ?? 0;
        return Math.max(declared, dyn);
      });

      const visibleCount = panels.filter((_, i) => !hiddens[i]).length;

      const sameAxis =
        (__parentAxis === 'width' && position === 'horizontal') ||
        (__parentAxis === 'height' && position === 'vertical');

      const intrinsic = sameAxis
        ? childMinsPx.reduce((a, b) => a + b, 0) + Math.max(0, visibleCount - 1)
        : childMinsPx.length
          ? Math.max(...childMinsPx)
          : 0;

      // Avoid reporting a value larger than current container size; parent may still clamp/normalize.
      __onIntrinsicMinChange(Math.min(intrinsic, containerSize || intrinsic));
      // re-report when relevant constraints change
    }, [
      __onIntrinsicMinChange,
      __parentAxis,
      position,
      panels.length,
      splitterSize,
      hiddens.join(','),
      intrinsicMins.join(','),
    ]);

    // ---- Enhance panels + splitters --------------------------------------
    const enhancedChildren = (
      <>
        {panels.map((child, index) => {
          const sizePct = sizes[index] ?? 0;
          const isHidden = hiddens[index];

          const sizeStyle = isHidden
            ? { display: 'none' }
            : position === 'horizontal'
              ? {
                  width: `${sizePct}%`,
                  minWidth: `${child.props.minSize ?? 0}px`,
                  flex: '0 0 auto',
                }
              : { height: `${sizePct}%`, minHeight: `${child.props.minSize ?? 0}px` };

          const parentAxis: 'width' | 'height' = position === 'horizontal' ? 'width' : 'height';

          return React.cloneElement(child, {
            key: child.key ?? `panel-${index}`, // 🔑 keep original key
            style: { ...child.props.style, ...sizeStyle },
            __onIntrinsicMinChange: (px: number) => updateIntrinsicMin(index, px),
            __parentAxis: parentAxis,
          } as Partial<SplitPanelProps>);
        })}

        {(() => {
          const el = containerRef.current;
          const containerSize = el
            ? position === 'horizontal'
              ? el.clientWidth
              : el.clientHeight
            : 0;

          const visibleSizesPct = sizes.map((s, i) => (hiddens[i] ? 0 : (s ?? 0)));
          const cumPct: number[] = [];
          let acc = 0;
          for (let i = 0; i < panels.length; i++) {
            const minSizePct = ((panels[i].props.minSize ?? 0) / (containerSize || 1)) * 100;
            acc += Math.max(visibleSizesPct[i] || 0, minSizePct);
            cumPct.push(acc);
          }

          return panels.slice(0, -1).map((_, i) => {
            if (hiddens[i] || hiddens[i + 1]) return null;
            const boundaryPx = (cumPct[i] / 100) * (containerSize || 0);
            return (
              <Splitter
                key={`splitter-${i}`}
                size={splitterSize}
                index={i}
                position={position}
                onResize={handleResize}
                className={cn(splitterClassName)}
                boundaryPx={isNaN(boundaryPx) ? 0 : boundaryPx}
              />
            );
          });
        })()}
      </>
    );

    return (
      <div
        ref={mergedRef}
        className={cn(
          'Split',
          className,
          position === 'horizontal' ? 'flex-row' : 'flex-col',
          'flex',
          'w-full',
          'h-full',
          'overflow-hidden',
          'relative',
        )}
        {...props}
      >
        {enhancedChildren}
      </div>
    );
  },
);

Split.displayName = 'Split';

export const SplitPanel = (props: SplitPanelProps & { className?: string }) => {
  const {
    // internal wiring — do not forward to DOM
    __onIntrinsicMinChange,
    __parentAxis,

    // Split-only props — strip these so they don't hit the DOM
    size,
    initialSize,
    minSize,
    maxSize,
    hidden, // note: HTML has 'hidden' attribute; don't leak it here
    canHidden,
    hiddenSize,
    onSizeChange,
    onHidden,

    // DOM-safe
    className,
    children,
    ...domProps // e.g. id, role, aria-*, data-*, tabIndex, onClick, etc.
  } = props;

  // Forward internal props to non-DOM React element children (e.g., nested Split)
  const forwardedChildren = React.useMemo(() => {
    return React.Children.map(children, child => {
      if (!React.isValidElement(child)) return child;
      const isDom = typeof child.type === 'string';
      if (isDom) return child;
      return React.cloneElement(child as any, {
        __onIntrinsicMinChange,
        __parentAxis,
      });
    });
  }, [children, __onIntrinsicMinChange, __parentAxis]);

  return (
    <div className={className} {...domProps}>
      {forwardedChildren}
    </div>
  );
};
type SplitterOverlayProps = SplitterProps & { boundaryPx: number };

const Splitter = forwardRef<HTMLDivElement, SplitterOverlayProps>(
  ({ className, size, index, position, onResize, boundaryPx, ...rest }, ref) => {
    const startPosRef = useRef<number>(0);
    const [isDragging, setIsDragging] = useState(false);

    const handleMouseMove = useCallback(
      (e: MouseEvent) => {
        const currentPos = position === 'horizontal' ? e.clientX : e.clientY;
        const delta = currentPos - startPosRef.current;
        onResize(index, index + 1, delta);
      },
      [index, onResize, position],
    );

    const handleMouseUp = useCallback(
      (e: MouseEvent) => {
        const currentPos = position === 'horizontal' ? e.clientX : e.clientY;
        const delta = currentPos - startPosRef.current;
        onResize(index, index + 1, delta, true);

        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
        setIsDragging(false);
        document.body.classList.remove('cursor-col-resize', 'cursor-row-resize', 'select-none');
      },
      [index, onResize, position, handleMouseMove],
    );

    const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      startPosRef.current = position === 'horizontal' ? e.clientX : e.clientY;
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      setIsDragging(true);
      document.body.classList.add(
        position === 'horizontal' ? 'cursor-col-resize' : 'cursor-row-resize',
        'select-none',
      );
    };

    const isH = position === 'horizontal';
    const crossStyles = isH ? { top: 0, height: '100%' } : { left: 0, width: '100%' };
    if (isNaN(boundaryPx)) boundaryPx = 0;
    return (
      <div
        ref={ref}
        className={cn(className, 'splitter')}
        style={{
          position: 'absolute', // overlay without affecting layout
          [isH ? 'left' : 'top']: Math.max(0, boundaryPx - size / 2), // center on line
          ...(crossStyles as React.CSSProperties),
          cursor: isH ? 'col-resize' : 'row-resize',
          width: isH ? `${size}px` : '100%',
          height: !isH ? `${size}px` : '100%',
          zIndex: 10,
          backgroundColor: isDragging ? 'var(--color-primary)' : '',
        }}
        onMouseDown={handleMouseDown}
        {...rest}
      />
    );
  },
);

SplitPanel.displayName = 'SplitPanel';
