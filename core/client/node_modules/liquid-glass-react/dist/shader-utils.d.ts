export interface Vec2 {
    x: number;
    y: number;
}
export interface ShaderOptions {
    width: number;
    height: number;
    fragment: (uv: Vec2, mouse?: Vec2) => Vec2;
    mousePosition?: Vec2;
}
export declare const fragmentShaders: {
    liquidGlass: (uv: Vec2) => Vec2;
};
export type FragmentShaderType = keyof typeof fragmentShaders;
export declare class ShaderDisplacementGenerator {
    private options;
    private canvas;
    private context;
    private canvasDPI;
    constructor(options: ShaderOptions);
    updateShader(mousePosition?: Vec2): string;
    destroy(): void;
    getScale(): number;
}
//# sourceMappingURL=shader-utils.d.ts.map