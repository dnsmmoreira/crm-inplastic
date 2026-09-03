ALTER TABLE public.leads
  ADD CONSTRAINT leads_motivo_perda_check
  CHECK (
    motivo_perda IS NULL OR motivo_perda IN (
      'Preço',
      'Concorrente',
      'Prazo de entrega',
      'Produto não atende',
      'Condições comerciais',
      'Sem resposta do cliente',
      'Sem aprovação interna',
      'Demanda cancelada ou adiada',
      'Duplicidade',
      'Lead inválido'
    )
  );