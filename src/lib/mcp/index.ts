import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listDocumentsTool from "./tools/list-documents";
import listContractsTool from "./tools/list-contracts";
import whoamiTool from "./tools/whoami";

// External (BYO) Supabase — issuer must be the direct supabase.co host.
// Fallback keeps the value well-formed during build/manifest evaluation;
// a token can never verify against the sentinel, so it's safe.
const supabaseUrl = process.env.EXTERNAL_SUPABASE_URL ?? "https://project-ref-unset.supabase.co";
const issuer = `${supabaseUrl.replace(/\/+$/, "")}/auth/v1`;

export default defineMcp({
  name: "document-hub-mcp",
  title: "Corporate Document & Contract Hub",
  version: "0.1.0",
  instructions:
    "Tools for the Corporate Document & Contract Hub. Use `whoami` to check the signed-in identity, `list_documents` to search documents, and `list_contracts` to list or filter contracts (e.g. expiring soon). All tools operate as the signed-in user under row-level security.",
  auth: auth.oauth.issuer({
    issuer,
    acceptedAudiences: "authenticated",
  }),
  tools: [whoamiTool, listDocumentsTool, listContractsTool],
});
