import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listLeads from "./tools/list_leads";
import listTasks from "./tools/list_tasks";
import pipelineStats from "./tools/pipeline_stats";

// OAuth issuer must be the direct Supabase host (project ref survives publish).
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "inplastic-crm-mcp",
  title: "INPLASTIC CRM",
  version: "0.1.0",
  instructions:
    "Ferramentas de leitura do CRM INPLASTIC. Use `list_leads` para consultar leads (opcionalmente por estágio), `list_tasks` para tarefas, e `pipeline_stats` para métricas do funil. Todos os dados são escopados ao usuário autenticado.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listLeads, listTasks, pipelineStats],
});
