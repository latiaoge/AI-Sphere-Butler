interface LiquidGlassProps {
    children: React.ReactNode;
    displacementScale?: number;
    blurAmount?: number;
    saturation?: number;
    aberrationIntensity?: number;
    elasticity?: number;
    cornerRadius?: number;
    globalMousePos?: {
        x: number;
        y: number;
    };
    mouseOffset?: {
        x: number;
        y: number;
    };
    mouseContainer?: React.RefObject<HTMLElement | null> | null;
    className?: string;
    padding?: string;
    style?: React.CSSProperties;
    overLight?: boolean;
    mode?: "standard" | "polar" | "prominent" | "shader";
    onClick?: () => void;
}
export default function LiquidGlass({ children, displacementScale, blurAmount, saturation, aberrationIntensity, elasticity, cornerRadius, globalMousePos: externalGlobalMousePos, mouseOffset: externalMouseOffset, mouseContainer, className, padding, overLight, style, mode, onClick, }: LiquidGlassProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=index.d.ts.map