"use client";

import * as React from "react";
import { Renderer } from "@openuidev/react-lang";
import { openuiLibrary, ThemeProvider, defaultDarkTheme } from "@openuidev/react-ui";
import "@openuidev/react-ui/defaults.css";
import "@openuidev/react-ui/components.css";
import "@/app/openui-theme.css";

interface OpenUIClientInnerProps {
  source: string;
  isStreaming?: boolean;
}

export function OpenUIClientInner({ source, isStreaming }: OpenUIClientInnerProps) {
  return (
    <ThemeProvider mode="dark" darkTheme={defaultDarkTheme}>
      <Renderer
        response={source}
        library={openuiLibrary}
        isStreaming={isStreaming}
        onError={(err) => console.warn("[OpenUI Render Notice]", err)}
      />
    </ThemeProvider>
  );
}
