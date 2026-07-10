import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listLeads from "./tools/list_leads";
import listTasks from "./tools/list_tasks";
import pipelineStats from "./tools/pipeline_stats";
import xerifeLogRecent from "./tools/xerife_log_recent";
import placarAtual from "./tools/placar_atual";
import xerifeConfigView from "./tools/xerife_config_view";

// OAuth issuer must be the direct Supabase host (project ref survives publish).
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "inplastic-crm-mcp",
  title: "INPLASTIC CRM",
  version: "0.2.0",
  instructions:
    "Ferramentas de leitura do CRM INPLASTIC (admin vê tudo; vendedor vê apenas o próprio escopo, aplicado via RLS). Leads/pipeline: `list_leads`, `pipeline_stats`. Tarefas: `list_tasks`. Motor Xerife: `xerife_log_recent`, `xerife_config_view`. Placar: `placar_atual`.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listLeads, listTasks, pipelineStats, xerifeLogRecent, placarAtual, xerifeConfigView],
});
