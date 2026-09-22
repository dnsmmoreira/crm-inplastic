-- Restringe a leitura da tabela xerife_config aos administradores.
-- Os pesos do placar (placar_peso_*, placar_dias_sem_proposta_limite) não podem
-- ser visíveis a vendedor/operacional. Os caminhos operacionais já leem pela RPC
-- SECURITY DEFINER public.xerife_config_operacional(), que continua liberada para
-- authenticated e service_role.
DROP POLICY IF EXISTS "xerife_config read authenticated" ON public.xerife_config;

CREATE POLICY "xerife_config read admin"
  ON public.xerife_config
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));