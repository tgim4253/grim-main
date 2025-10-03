export interface CSSVariables extends React.CSSProperties {
  [key: `--${string}`]: string | number;
}
