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

// Top tier synchronous imports for instant 0ms rendering of common enterprise technologies
import python from "@thesvg/icons/python";
import typescript from "@thesvg/icons/typescript";
import javascript from "@thesvg/icons/javascript";
import go from "@thesvg/icons/go";
import rust from "@thesvg/icons/rust";
import java from "@thesvg/icons/java";
import php from "@thesvg/icons/php";
import ruby from "@thesvg/icons/ruby";
import cplusplus from "@thesvg/icons/cplusplus";
import csharp from "@thesvg/icons/csharp";

import nodedotjs from "@thesvg/icons/nodedotjs";
import react from "@thesvg/icons/react";
import nextdotjs from "@thesvg/icons/nextdotjs";
import vuedotjs from "@thesvg/icons/vuedotjs";
import angular from "@thesvg/icons/angular";
import svelte from "@thesvg/icons/svelte";
import tailwindcss from "@thesvg/icons/tailwindcss";

import postgresql from "@thesvg/icons/postgresql";
import mysql from "@thesvg/icons/mysql";
import redis from "@thesvg/icons/redis";
import mongodb from "@thesvg/icons/mongodb";
import sqlite from "@thesvg/icons/sqlite";
import supabase from "@thesvg/icons/supabase";

import aws from "@thesvg/icons/aws";
import googlecloud from "@thesvg/icons/googlecloud";
import azure from "@thesvg/icons/azure";
import docker from "@thesvg/icons/docker";
import kubernetes from "@thesvg/icons/kubernetes";
import cloudflare from "@thesvg/icons/cloudflare";
import vercel from "@thesvg/icons/vercel";
import linux from "@thesvg/icons/linux";

import github from "@thesvg/icons/github";
import gitlab from "@thesvg/icons/gitlab";
import git from "@thesvg/icons/git";
import npm from "@thesvg/icons/npm";
import bun from "@thesvg/icons/bun";
import vite from "@thesvg/icons/vite";

import stripe from "@thesvg/icons/stripe";
import resend from "@thesvg/icons/resend";
import openai from "@thesvg/icons/openai";
import graphql from "@thesvg/icons/graphql";
import html5 from "@thesvg/icons/html5";
import css3 from "@thesvg/icons/css3";

export interface TheSvgIconModule {
  slug: string;
  title: string;
  hex: string;
  categories: string[];
  aliases: string[];
  svg: string;
  variants: Record<string, string>;
  license?: string;
  url?: string;
}

/**
 * Fast synchronous core icon registry
 */
export const CORE_ICONS: Record<string, TheSvgIconModule> = {
  python,
  typescript,
  javascript,
  go,
  rust,
  java,
  php,
  ruby,
  cplusplus,
  csharp,

  nodedotjs,
  react,
  nextdotjs,
  vuedotjs,
  angular,
  svelte,
  tailwindcss,

  postgresql,
  mysql,
  redis,
  mongodb,
  sqlite,
  supabase,

  aws,
  googlecloud,
  azure,
  docker,
  kubernetes,
  cloudflare,
  vercel,
  linux,

  github,
  gitlab,
  git,
  npm,
  bun,
  vite,

  stripe,
  resend,
  openai,
  graphql,
  html5,
  css3,
};

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
