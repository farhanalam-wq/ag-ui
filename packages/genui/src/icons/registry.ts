import type { ComponentType } from "react";
import {
  Code,
  Cube,
  Database,
  Cloud,
  Wrench,
  Buildings,
  ShieldCheck,
  PlugsConnected,
} from "@phosphor-icons/react";

// Phase B: brand SVG package removed. CORE_ICONS is an empty tombstone so all
// consumers resolve via Phosphor category fallbacks (see getCategoryFallback).

export interface TheSvgIconModule {
  slug: string;
  title: string;
  hex: string;
  categories?: string[];
  aliases?: string[];
  svg: string;
  variants?: Record<string, string>;
  license?: string;
  url?: string;
}

/**
 * Empty tombstone (Phase B): brand SVGs were removed with the icon package.
 * All resolution falls through to Phosphor category fallbacks.
 */
export const CORE_ICONS: Record<string, TheSvgIconModule> = {};

export async function loadIconModule(slug: string): Promise<TheSvgIconModule | null> {
  void slug;
  return null;
}

/**
 * Fallback semantic icons from Phosphor for when an exact brand SVG is not available.
 * Guaranteed never to fail or produce broken images.
 */
export const CATEGORY_FALLBACK_ICONS: Record<string, ComponentType<any>> = {
  language: Code,
  framework: Cube,
  database: Database,
  cloud: Cloud,
  devtool: Wrench,
  saas: Buildings,
  security: ShieldCheck,
  protocol: PlugsConnected,
  general: Cube,
};

export function getCategoryFallback(category?: string): ComponentType<any> {
  if (category && category in CATEGORY_FALLBACK_ICONS) {
    return CATEGORY_FALLBACK_ICONS[category];
  }
  return Cube;
}
