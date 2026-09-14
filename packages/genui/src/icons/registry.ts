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

// Synchronous core imports for instant 0ms rendering across all core tech & enterprise brands

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

// Enterprise Global Brands & Cloud Providers (0ms Instant Core Resolution)
import redhat from "@thesvg/icons/red-hat";
import nasa from "@thesvg/icons/nasa";
import bmw from "@thesvg/icons/bmw";
import walmart from "@thesvg/icons/walmart";
import amex from "@thesvg/icons/american-express";
import meta from "@thesvg/icons/meta";
import apple from "@thesvg/icons/apple";
import microsoft from "@thesvg/icons/microsoft";
import google from "@thesvg/icons/google";
import amazon from "@thesvg/icons/amazon";
import ibm from "@thesvg/icons/ibm";
import oracle from "@thesvg/icons/oracle";
import intel from "@thesvg/icons/intel";
import nvidia from "@thesvg/icons/nvidia";
import amd from "@thesvg/icons/amd";
import salesforce from "@thesvg/icons/salesforce";
import sap from "@thesvg/icons/sap";
import adobe from "@thesvg/icons/adobe";
import cisco from "@thesvg/icons/cisco";
import vmware from "@thesvg/icons/vmware";
import snowflake from "@thesvg/icons/snowflake";
import databricks from "@thesvg/icons/databricks";
import tesla from "@thesvg/icons/tesla";
import netflix from "@thesvg/icons/netflix";
import uber from "@thesvg/icons/uber";
import spotify from "@thesvg/icons/spotify";
import shopify from "@thesvg/icons/shopify";
import paypal from "@thesvg/icons/paypal";
import accenture from "@thesvg/icons/accenture";

// Custom verified brand SVG for CERN
const cern: TheSvgIconModule = {
  title: "CERN",
  slug: "cern",
  hex: "0053A0",
  categories: ["scientific", "enterprise"],
  aliases: ["european organization for nuclear research"],
  svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#0053A0" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9.5"/><circle cx="12" cy="12" r="5.5"/><circle cx="12" cy="12" r="2"/><line x1="12" y1="2.5" x2="12" y2="21.5"/><line x1="2.5" y1="12" x2="21.5" y2="12"/></svg>',
  variants: {},
};

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
 * Fast synchronous core icon registry containing top tech & global enterprise brands for 0ms instant rendering
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

  // Enterprise Brands & Companies
  "red-hat": redhat,
  redhat,
  nasa,
  bmw,
  walmart,
  "american-express": amex,
  amex,
  cern,
  meta,
  apple,
  microsoft,
  google,
  amazon,
  ibm,
  oracle,
  intel,
  nvidia,
  amd,
  salesforce,
  sap,
  adobe,
  cisco,
  vmware,
  snowflake,
  databricks,
  tesla,
  netflix,
  uber,
  spotify,
  shopify,
  paypal,
  accenture,
};

/**
 * Dynamic in-memory cache for on-demand loading of any of the remaining 7,300+ icons
 */
const dynamicIconCache = new Map<string, TheSvgIconModule>();

/**
 * Asynchronously loads an icon from CORE_ICONS, the client API proxy, or dynamic import
 */
export async function loadIconModule(slug: string): Promise<TheSvgIconModule | null> {
  const normalizedSlug = slug.toLowerCase().trim();

  if (CORE_ICONS[normalizedSlug]) {
    return CORE_ICONS[normalizedSlug];
  }
  if (dynamicIconCache.has(normalizedSlug)) {
    return dynamicIconCache.get(normalizedSlug)!;
  }

  // If in the browser, fetch from the Next.js API proxy for safe, lightweight zero-bundle overhead
  if (typeof window !== "undefined") {
    try {
      const res = await fetch(`/api/icon?slug=${encodeURIComponent(normalizedSlug)}`);
      if (res.ok) {
        const data = await res.json();
        if (data?.svg) {
          const mod: TheSvgIconModule = {
            slug: data.slug || normalizedSlug,
            title: data.title || normalizedSlug,
            hex: data.hex || "71717A",
            svg: data.svg,
            variants: {},
          };
          dynamicIconCache.set(normalizedSlug, mod);
          return mod;
        }
      }
    } catch {
      // Graceful fallback
    }
  }

  // Fallback for SSR / Node environment
  try {
    const mod = await import(`@thesvg/icons/${normalizedSlug}`);
    if (mod?.default?.svg) {
      dynamicIconCache.set(normalizedSlug, mod.default);
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
