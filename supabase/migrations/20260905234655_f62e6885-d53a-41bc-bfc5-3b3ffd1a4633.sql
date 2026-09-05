ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS xerife_isento boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.xerife_isento IS 'Usuário lança pedidos mas não recebe cobrança do Xerife; as tarefas dele vão para o grupo operacional.';

UPDATE public.profiles SET xerife_isento = true WHERE id = 'c6709451-2654-4564-a065-0757b89297ac';