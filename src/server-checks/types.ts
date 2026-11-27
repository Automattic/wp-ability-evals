// What the server checks find on a site's MCP server, once per run and without an agent: which of the packs'
// abilities it presents, which it lacks, which of its tools no pack lists, and what is wrong in the listed
// abilities' definitions.

/** One problem found in an ability's MCP tool definition or contract: schema portability, description, annotation hints, or direct exposure. */
export interface DefinitionFinding {
  /** The listed ability whose tool definition has the problem, as its pack names it. */
  ability: string;
  /** `error` fails `site check`; `warning` is reported without failing it. Neither leaves a scenario out of a run. */
  severity: 'error' | 'warning';
  /** Short rule name, such as `boolean-schema`, `type-union`, `missing-description`, `read-only-mismatch`, `missing-hint`, `hint-mismatch`, or `not-direct-tool`. */
  rule: string;
  /** Where in the tool definition the problem sits, such as `inputSchema.properties.id`, `description`, `annotations.destructiveHint`, or `tools`. */
  path: string;
  /** What is wrong. */
  issue: string;
  /** How to fix it. */
  suggestion: string;
}

/** The four boolean MCP tool annotation hints reported by `tools/list`. */
export type ToolHint = 'readOnlyHint' | 'destructiveHint' | 'idempotentHint' | 'openWorldHint';

/** Expected explicit boolean values for MCP tool annotation hints on one ability. */
export type ExpectedHints = Partial<Record<ToolHint, boolean>>;

/**
 * Opt-in contract checks that `site check` (and the server checks before a run) enforce on what the site's
 * MCP server advertises in `tools/list`. Leave omitted to keep default behavior (optional hints and lookup /
 * hybrid servers allowed).
 */
export interface ServerCheckConfig {
  /**
   * MCP tool annotation hints that every directly exposed listed ability must explicitly advertise as a boolean.
   * An omitted hint fails as missing; an explicit `false` passes.
   */
  requiredHints?: ToolHint[];
  /**
   * Expected explicit boolean hint values per ability name (as listed in `pack.yaml`).
   * An omitted hint fails as missing and does not match an expected `false`.
   */
  hints?: Record<string, ExpectedHints>;
  /**
   * Listed abilities that must appear as individually callable direct tools in `tools/list` rather than only
   * behind a lookup or generic executor tool. Pass `true` to require every listed ability on the site, a list
   * of specific ability names, or `false` (for example in a site file override) to disable the check.
   */
  directTools?: boolean | string[];
}

/** MCP tool annotations reported by `tools/list`. */
export interface ToolAnnotations {
  title?: string;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

/** One MCP tool definition as `tools/list` returns it, keeping the fields the definition checks and viewer inspect. */
export interface ListedTool {
  name: string;
  title?: string;
  description?: string;
  annotations?: ToolAnnotations;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
}

/** Full MCP tool snapshot saved alongside `run.json` in `server.json` for lazy inspection in the viewer. */
export interface ServerSnapshot {
  /** Version of `@modelcontextprotocol/inspector` that inspected the server. */
  inspectorVersion?: string;
  /** Every tool the server returned from `tools/list`. */
  tools: ListedTool[];
}

/** One schema portability finding reported by MCP Inspector `--strict` for a single tool. */
export interface SchemaFinding {
  toolName: string;
  rule: string;
  severity: 'error' | 'warning';
  /** Which schema (`inputSchema` or `outputSchema`) and the path inside it, such as `inputSchema.properties.id`. */
  path: string;
  issue: string;
  suggestion: string;
}

/** What MCP Inspector returns for `tools/list --strict`: the tools and any schema portability findings. */
export interface ListedServer {
  tools: ListedTool[];
  schemaFindings: SchemaFinding[];
  inspectorVersion?: string;
}

export type ServerFindings =
  | {
      /** The server listed its tools, and they were compared with the abilities its packs list. */
      outcome: 'compared';
      /** Version of `@modelcontextprotocol/inspector` that inspected the server. Omitted in older saved runs. */
      inspectorVersion?: string;
      /** The abilities the packs list that the server presents, as the packs name them. */
      onSite: string[];
      /** The abilities the packs list that the server does not present. */
      missing: string[];
      /** The server's tools that present no ability of the packs and are no lookup tool, by their tool name. */
      inNoPack: string[];
      /**
       * Problems found in the definitions of the listed abilities on the site (schema portability, descriptions,
       * read/write annotations). Omitted when none were found, or in runs saved before definition checks existed.
       */
      definitionFindings?: DefinitionFinding[];
    }
  | {
      /**
       * The server lists a tool that runs any ability, so abilities may sit behind it, where a list of tools
       * does not show them. Nothing was compared, and no scenario is left out for it.
       */
      outcome: 'behind-lookup';
      /** Version of `@modelcontextprotocol/inspector` that inspected the server. Omitted in older saved runs. */
      inspectorVersion?: string;
      /** The server's tools that run any ability. */
      runTools: string[];
      /**
       * Problems found by opt-in server contract checks (for example, abilities required to be exposed as
       * direct tools that are only reachable behind lookup). Omitted when none were found.
       */
      definitionFindings?: DefinitionFinding[];
    }
  | {
      /** The server could not be read, so nothing is known about its abilities. */
      outcome: 'unreadable';
      reason: string;
    };
