import React from "react";
import { Composition } from "remotion";
import { Video } from "./Video";
import { FPS } from "../src/dsl/durations";

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="Video"
      component={Video}
      durationInFrames={150}
      fps={FPS}
      width={1280}
      height={720}
      defaultProps={{
        plan: { scenes: [] },
        theme: {
          primary: "#DB102A",
          background: "#09090b",
          surface: "#09090b",
          text: "#fafafa",
          accent: "#3b82f6",
          fontHeading: "Inter",
          fontBody: "Inter",
          radius: "0.5rem",
        },
        timeline: { scenes: [], totalFrames: 150 },
      }}
      calculateMetadata={({ props }: any) => {
        const total = props?.timeline?.totalFrames ?? 150;
        return { durationInFrames: Math.max(30, total), props };
      }}
    />
  );
};
