"use client";

import { useId, useMemo } from "react";
import type { GameProjectDocument } from "@/lib/game-engine/types";
import { SKETCH_HEIGHT, SKETCH_WIDTH, sketchProject } from "./scene-sketch";

/** The first frame of a project drawn as SVG from its scene data (no WebGL). */
export default function SceneSketch({ project, className = "", label }: { project: GameProjectDocument; className?: string; label?: string }) {
    const data = useMemo(() => sketchProject(project), [project]);
    const gradient = `sketch-${useId().replace(/:/g, "")}`;
    return (
        <svg viewBox={`0 0 ${SKETCH_WIDTH} ${SKETCH_HEIGHT}`} preserveAspectRatio="xMidYMid slice" className={className} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
            <defs>
                <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor={data.top} />
                    <stop offset="1" stopColor={data.bottom} />
                </linearGradient>
            </defs>
            <rect width={SKETCH_WIDTH} height={SKETCH_HEIGHT} fill={`url(#${gradient})`} />
            {data.shapes.map((shape, index) => {
                switch (shape.kind) {
                    case "polygon":
                        return <polygon key={index} points={shape.points} fill={shape.fill} opacity={shape.opacity} />;
                    case "ellipse":
                        return <ellipse key={index} cx={shape.cx} cy={shape.cy} rx={shape.rx} ry={shape.ry} fill={shape.fill} opacity={shape.opacity} transform={shape.rotate ? `rotate(${shape.rotate} ${shape.cx} ${shape.cy})` : undefined} />;
                    case "rect":
                        return <rect key={index} x={shape.x} y={shape.y} width={shape.width} height={shape.height} rx={shape.rx} fill={shape.fill} opacity={shape.opacity} transform={shape.rotate ? `rotate(${shape.rotate} ${shape.x + shape.width / 2} ${shape.y + shape.height / 2})` : undefined} />;
                    case "text":
                        return <text key={index} x={shape.x} y={shape.y} fontSize={shape.size} fill={shape.fill} textAnchor={shape.anchor} dominantBaseline={shape.baseline} fontWeight={shape.bold ? 700 : 500} direction="ltr">{shape.text}</text>;
                }
            })}
        </svg>
    );
}
