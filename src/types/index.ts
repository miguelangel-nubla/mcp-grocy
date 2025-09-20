/**
 * Improved type definitions for better type safety
 */

import { z } from 'zod';

// API Response types
export interface ApiResponse<T = any> {
  data: T;
  status: number;
  headers: Record<string, any>;
}

// Tool execution types
export interface ToolResult {
  success: boolean;
  data?: any;
  error?: string;
  message?: string;
  details?: any;
}

export type ToolHandler = (args: any, subConfigs?: Map<string, any>) => Promise<ToolResult>;

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface ToolModule {
  definitions: ToolDefinition[];
  handlers: Record<string, ToolHandler>;
}

// Configuration types
export const ConfigSchema = z.object({
  env: z.object({
    GROCY_APIKEY_VALUE: z.string().optional(),
    RELEASE_VERSION: z.string().optional(),
    NODE_ENV: z.enum(['development', 'production', 'test']).optional(),
  }),
  yaml: z.object({
    server: z.object({
      enable_http_server: z.boolean().default(false),
      http_server_port: z.number().min(1).max(65535).default(8080),
    }),
    grocy: z.object({
      base_url: z.string().url(),
      enable_ssl_verify: z.boolean().default(true),
      response_size_limit: z.number().positive().default(10000),
    }),
    tools: z.record(z.string(), z.object({
      enabled: z.boolean().default(false),
      ack_token: z.string().optional(),
    }).catchall(z.unknown())),
  })
});

export type Config = z.infer<typeof ConfigSchema>;

// Error types
export type ErrorCategory = 'API' | 'VALIDATION' | 'CONFIG' | 'NETWORK' | 'INTERNAL' | 'AUTH';

export interface ErrorContext {
  category: ErrorCategory;
  statusCode?: number;
  operation?: string;
  details?: any;
}

// Grocy API specific types
export interface GrocyProduct {
  id: number;
  name: string;
  description?: string;
  product_group_id?: number;
  quantity_unit_id: number;
  quantity_unit_purchase?: number;
  quantity_unit_stock?: number;
  min_stock_amount?: number;
  default_best_before_days?: number;
  default_best_before_days_after_open?: number;
  default_best_before_days_after_freezing?: number;
  default_best_before_days_after_thawing?: number;
  picture_file_name?: string;
  allow_partial_units_in_stock?: boolean;
  enable_tare_weight_handling?: boolean;
  tare_weight?: number;
  not_check_stock_fulfillment_for_recipes?: boolean;
  parent_product_id?: number;
  calories?: number;
  cumulate_min_stock_amount_of_sub_products?: boolean;
  due_type?: number;
  quick_consume_amount?: number;
  hide_on_stock_overview?: boolean;
  default_stock_label_type?: number;
  should_not_be_frozen?: boolean;
  treat_opened_as_out_of_stock?: boolean;
  no_own_stock?: boolean;
}

export interface GrocyStockEntry {
  id: number;
  product_id: number;
  amount: number;
  best_before_date?: string;
  purchased_date?: string;
  stock_id?: string;
  price?: number;
  open?: boolean;
  opened_date?: string;
  location_id?: number;
  shopping_location_id?: number;
  note?: string;
}

export interface GrocyRecipe {
  id: number;
  name: string;
  description?: string;
  type: 'normal' | 'mealplan-week';
  servings?: number;
  servings_can_be_scaled?: boolean;
  base_servings?: number;
  desired_servings?: number;
  not_check_shoppinglist?: boolean;
  picture_file_name?: string;
}

export interface GrocyLocation {
  id: number;
  name: string;
  description?: string;
  is_freezer?: boolean;
}

export interface GrocyQuantityUnit {
  id: number;
  name: string;
  name_plural?: string;
  description?: string;
  plural_forms?: string;
}

// Validation schemas for runtime type checking
export const ToolResultSchema = z.object({
  success: z.boolean(),
  data: z.any().optional(),
  error: z.string().optional(),
  message: z.string().optional(),
  details: z.any().optional()
});

export const ToolDefinitionSchema = z.object({
  name: z.string(),
  description: z.string(),
  inputSchema: z.object({
    type: z.literal('object'),
    properties: z.record(z.any()),
    required: z.array(z.string()).optional()
  })
});

export const ToolModuleSchema = z.object({
  definitions: z.array(ToolDefinitionSchema),
  handlers: z.record(z.function())
});

// Type guards
export function isToolResult(obj: any): obj is ToolResult {
  return ToolResultSchema.safeParse(obj).success;
}

export function isToolDefinition(obj: any): obj is ToolDefinition {
  return ToolDefinitionSchema.safeParse(obj).success;
}

export function isToolModule(obj: any): obj is ToolModule {
  return obj &&
         typeof obj === 'object' &&
         Array.isArray(obj.definitions) &&
         typeof obj.handlers === 'object' &&
         obj.definitions.every((def: any) => isToolDefinition(def));
}

// Utility types
export type Awaitable<T> = T | Promise<T>;
export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
export type RequiredKeys<T> = {
  [K in keyof T]-?: {} extends Pick<T, K> ? never : K;
}[keyof T];

// API method types
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

export interface ApiRequestOptions {
  method?: HttpMethod;
  body?: any;
  headers?: Record<string, string>;
  queryParams?: Record<string, string>;
  timeout?: number;
}

// Resource types for MCP
export interface ResourceInfo {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface ResourceContent {
  uri: string;
  mimeType: string;
  text?: string;
  blob?: string;
}
