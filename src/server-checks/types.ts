// What the server checks find on a site's MCP server, once per run and without an agent: which of the packs'
// abilities it presents, which it lacks, which of its tools no pack lists, and what is wrong in the listed
// abilities' definitions.

/** One problem found in an ability's MCP tool definition: schema portability, missing description or read/write annotation. */
export interface DefinitionFinding {
  /** The listed ability whose tool definition has the problem, as its pack names it. */
  ability: string;
  /** `error` fails `site check`; `warning` is reported without failing it. Neither leaves a scenario out of a run. */
  severity: 'error' | 'warning';
  /** Short rule name, such as `boolean-schema`, `type-union`, `missing-description` or `read-only-mismatch`. */
  rule: string;
  /** Where in the tool definition the problem sits, such as `inputSchema.properties.id`, `description` or `annotations.readOnlyHint`. */
  path: string;
  /** What is wrong. */
  issue: string;
  /** How to fix it. */
  suggestion: string;
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
    }
  | {
      /** The server could not be read, so nothing is known about its abilities. */
      outcome: 'unreadable';
      reason: string;
    };
