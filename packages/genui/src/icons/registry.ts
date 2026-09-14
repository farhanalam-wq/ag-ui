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

// Synchronous core imports for instant 0ms rendering across all 87 mapped technologies

// Languages
import python from "@thesvg/icons/python";
import typescript from "@thesvg/icons/typescript";
import javascript from "@thesvg/icons/javascript";
import go from "@thesvg/icons/go";
import rust from "@thesvg/icons/rust";
import java from "@thesvg/icons/java";
import php from "@thesvg/icons/php";
import ruby from "@thesvg/icons/ruby";
import c from "@thesvg/icons/c";
import cplusplus from "@thesvg/icons/cplusplus";
import csharp from "@thesvg/icons/csharp";
import swift from "@thesvg/icons/swift";
import kotlin from "@thesvg/icons/kotlin";
import dart from "@thesvg/icons/dart";
import scala from "@thesvg/icons/scala";
import r from "@thesvg/icons/r";
import elixir from "@thesvg/icons/elixir";
import lua from "@thesvg/icons/lua";

// Frameworks & Runtimes
import nodedotjs from "@thesvg/icons/nodedotjs";
import react from "@thesvg/icons/react";
import nextdotjs from "@thesvg/icons/nextdotjs";
import vuedotjs from "@thesvg/icons/vuedotjs";
import angular from "@thesvg/icons/angular";
import svelte from "@thesvg/icons/svelte";
import express from "@thesvg/icons/express";
import fastify from "@thesvg/icons/fastify";
import nestjs from "@thesvg/icons/nestjs";
import django from "@thesvg/icons/django";
import fastapi from "@thesvg/icons/fastapi";
import flask from "@thesvg/icons/flask";
import laravel from "@thesvg/icons/laravel";
import spring from "@thesvg/icons/spring";
import rubyonrails from "@thesvg/icons/ruby-on-rails";
import tailwindcss from "@thesvg/icons/tailwindcss";

// Databases & Storage
import postgresql from "@thesvg/icons/postgresql";
import mysql from "@thesvg/icons/mysql";
import redis from "@thesvg/icons/redis";
import mongodb from "@thesvg/icons/mongodb";
import sqlite from "@thesvg/icons/sqlite";
import supabase from "@thesvg/icons/supabase";
import prisma from "@thesvg/icons/prisma";
import drizzle from "@thesvg/icons/drizzle";
import clickhouse from "@thesvg/icons/clickhouse";
import elasticsearch from "@thesvg/icons/elasticsearch";
import cassandra from "@thesvg/icons/cassandra";
import neo4j from "@thesvg/icons/neo4j";
import mariadb from "@thesvg/icons/mariadb";

// Cloud & Infrastructure
import aws from "@thesvg/icons/aws";
import googlecloud from "@thesvg/icons/googlecloud";
import azure from "@thesvg/icons/azure";
import docker from "@thesvg/icons/docker";
import kubernetes from "@thesvg/icons/kubernetes";
import cloudflare from "@thesvg/icons/cloudflare";
import vercel from "@thesvg/icons/vercel";
import terraform from "@thesvg/icons/terraform";
import linux from "@thesvg/icons/linux";
import ubuntu from "@thesvg/icons/ubuntu";
import nginx from "@thesvg/icons/nginx";
import caddy from "@thesvg/icons/caddy";
import grafana from "@thesvg/icons/grafana";
import prometheus from "@thesvg/icons/prometheus";

// DevTools
import github from "@thesvg/icons/github";
import gitlab from "@thesvg/icons/gitlab";
import git from "@thesvg/icons/git";
import npm from "@thesvg/icons/npm";
import bun from "@thesvg/icons/bun";
import vite from "@thesvg/icons/vite";
import turborepo from "@thesvg/icons/turborepo";
import postman from "@thesvg/icons/postman";
import sentry from "@thesvg/icons/sentry";
import datadog from "@thesvg/icons/datadog";
import linear from "@thesvg/icons/linear";
import notion from "@thesvg/icons/notion";

// SaaS, Email & AI
import stripe from "@thesvg/icons/stripe";
import resend from "@thesvg/icons/resend";
import sendgridbadge from "@thesvg/icons/sendgrid-badge";
import postmark from "@thesvg/icons/postmark";
import mailgun from "@thesvg/icons/mailgun";
import twilio from "@thesvg/icons/twilio";
import openai from "@thesvg/icons/openai";
import anthropic from "@thesvg/icons/anthropic";
import slack from "@thesvg/icons/slack";
import discord from "@thesvg/icons/discord";

// Protocols & Web
import graphql from "@thesvg/icons/graphql";
import html5 from "@thesvg/icons/html5";
import css3 from "@thesvg/icons/css3";
import webassembly from "@thesvg/icons/webassembly";

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
 * Fast synchronous core icon registry containing all 87 mapped technologies for 0s instant rendering
 */
export const CORE_ICONS: Record<string, TheSvgIconModule> = {
  // Languages
  python,
  typescript,
  javascript,
  go,
  rust,
  java,
  php,
  ruby,
  c,
  cplusplus,
  csharp,
  swift,
  kotlin,
  dart,
  scala,
  r,
  elixir,
  lua,

  // Frameworks
  nodedotjs,
  react,
  nextdotjs,
  vuedotjs,
  angular,
  svelte,
  express,
  fastify,
  nestjs,
  django,
  fastapi,
  flask,
  laravel,
  spring,
  "ruby-on-rails": rubyonrails,
  tailwindcss,

  // Databases
  postgresql,
  mysql,
  redis,
  mongodb,
  sqlite,
  supabase,
  prisma,
  drizzle,
  clickhouse,
  elasticsearch,
  cassandra,
  neo4j,
  mariadb,

  // Cloud & Infra
  aws,
  googlecloud,
  azure,
  docker,
  kubernetes,
  cloudflare,
  vercel,
  terraform,
  linux,
  ubuntu,
  nginx,
  caddy,
  grafana,
  prometheus,

  // DevTools
  github,
  gitlab,
  git,
  npm,
  bun,
  vite,
  turborepo,
  postman,
  sentry,
  datadog,
  linear,
  notion,

  // SaaS & AI
  stripe,
  resend,
  "sendgrid-badge": sendgridbadge,
  postmark,
  mailgun,
  twilio,
  openai,
  anthropic,
  slack,
  discord,

  // Protocols & Web
  graphql,
  html5,
  css3,
  webassembly,
};

/**
 * Dynamic in-memory cache for on-demand loading of any of the remaining 6,500+ icons
 */
const dynamicIconCache = new Map<string, TheSvgIconModule>();

/**
 * Asynchronously loads an icon from @thesvg/icons if not already in CORE_ICONS
 */
export async function loadIconModule(slug: string): Promise<TheSvgIconModule | null> {
  if (CORE_ICONS[slug]) {
    return CORE_ICONS[slug];
  }
  if (dynamicIconCache.has(slug)) {
    return dynamicIconCache.get(slug)!;
  }
  try {
    const mod = await import(`@thesvg/icons/${slug}`);
    if (mod?.default?.svg) {
      dynamicIconCache.set(slug, mod.default);
      return mod.default;
    }
  } catch {
    // Icon does not exist in @thesvg/icons
  }
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
