-- ROLLBACK:
--   ALTER TABLE public.propostas DROP COLUMN IF EXISTS forma_pagamento;
--   ALTER TABLE public.condicoes_pagamento DROP COLUMN IF EXISTS ordem;
--   DELETE FROM public.condicoes_pagamento WHERE id LIKE 'p-%';
--   UPDATE public.condicoes_pagamento SET active = true WHERE id NOT LIKE 'p-%';

-- ITEM 1a — forma de pagamento na proposta
ALTER TABLE public.propostas ADD COLUMN IF NOT EXISTS forma_pagamento text;
ALTER TABLE public.propostas DROP CONSTRAINT IF EXISTS propostas_forma_pagamento_check;
ALTER TABLE public.propostas ADD CONSTRAINT propostas_forma_pagamento_check
  CHECK (forma_pagamento IS NULL OR forma_pagamento IN ('Boleto','Depósito em Conta','PIX'));

-- ITEM 1b — backfill a partir do method da condição atual
UPDATE public.propostas p
   SET forma_pagamento = CASE
         WHEN c.method IN ('Boleto','Depósito em Conta','PIX') THEN c.method
         ELSE 'Depósito em Conta'
       END
  FROM public.condicoes_pagamento c
 WHERE c.id = p.payment_term_id
   AND p.forma_pagamento IS NULL;

-- ITEM 1c — ordem própria do catálogo
ALTER TABLE public.condicoes_pagamento ADD COLUMN IF NOT EXISTS ordem int NOT NULL DEFAULT 0;

-- ITEM 2 — os 37 prazos novos
INSERT INTO public.condicoes_pagamento (id,label,method,splits,parcelas,active,acrescimo_percent,permite_pf,ordem) VALUES
  ('p-avista','À vista','Boleto','[0]'::jsonb,'[{"dias":0,"percentual":100}]'::jsonb,true,0,true,1),
  ('p-ato-7','Ato + 7','Boleto','[0,7]'::jsonb,'[{"dias":0,"percentual":50},{"dias":7,"percentual":50}]'::jsonb,true,0,false,2),
  ('p-ato-7-14','Ato + 7 + 14','Boleto','[0,7,14]'::jsonb,'[{"dias":0,"percentual":33.33},{"dias":7,"percentual":33.33},{"dias":14,"percentual":33.34}]'::jsonb,true,0,false,3),
  ('p-ato-7-14-21','Ato + 7 + 14 + 21','Boleto','[0,7,14,21]'::jsonb,'[{"dias":0,"percentual":25},{"dias":7,"percentual":25},{"dias":14,"percentual":25},{"dias":21,"percentual":25}]'::jsonb,true,0,false,4),
  ('p-ato-7-14-21-28','Ato + 7 + 14 + 21 + 28','Boleto','[0,7,14,21,28]'::jsonb,'[{"dias":0,"percentual":20},{"dias":7,"percentual":20},{"dias":14,"percentual":20},{"dias":21,"percentual":20},{"dias":28,"percentual":20}]'::jsonb,true,0,false,5),
  ('p-ato-15','Ato + 15','Boleto','[0,15]'::jsonb,'[{"dias":0,"percentual":50},{"dias":15,"percentual":50}]'::jsonb,true,0,false,6),
  ('p-ato-15-30','Ato + 15 + 30','Boleto','[0,15,30]'::jsonb,'[{"dias":0,"percentual":33.33},{"dias":15,"percentual":33.33},{"dias":30,"percentual":33.34}]'::jsonb,true,0,false,7),
  ('p-ato-15-30-45','Ato + 15 + 30 + 45','Boleto','[0,15,30,45]'::jsonb,'[{"dias":0,"percentual":25},{"dias":15,"percentual":25},{"dias":30,"percentual":25},{"dias":45,"percentual":25}]'::jsonb,true,0,false,8),
  ('p-7','7','Boleto','[7]'::jsonb,'[{"dias":7,"percentual":100}]'::jsonb,true,0,false,9),
  ('p-7-14','7 + 14','Boleto','[7,14]'::jsonb,'[{"dias":7,"percentual":50},{"dias":14,"percentual":50}]'::jsonb,true,0,false,10),
  ('p-7-14-21','7 + 14 + 21','Boleto','[7,14,21]'::jsonb,'[{"dias":7,"percentual":33.33},{"dias":14,"percentual":33.33},{"dias":21,"percentual":33.34}]'::jsonb,true,0,false,11),
  ('p-7-14-21-28','7 + 14 + 21 + 28','Boleto','[7,14,21,28]'::jsonb,'[{"dias":7,"percentual":25},{"dias":14,"percentual":25},{"dias":21,"percentual":25},{"dias":28,"percentual":25}]'::jsonb,true,0,false,12),
  ('p-15','15','Boleto','[15]'::jsonb,'[{"dias":15,"percentual":100}]'::jsonb,true,0,false,13),
  ('p-15-30','15 + 30','Boleto','[15,30]'::jsonb,'[{"dias":15,"percentual":50},{"dias":30,"percentual":50}]'::jsonb,true,0,false,14),
  ('p-15-30-45','15 + 30 + 45','Boleto','[15,30,45]'::jsonb,'[{"dias":15,"percentual":33.33},{"dias":30,"percentual":33.33},{"dias":45,"percentual":33.34}]'::jsonb,true,0,false,15),
  ('p-28','28','Boleto','[28]'::jsonb,'[{"dias":28,"percentual":100}]'::jsonb,true,0,false,16),
  ('p-34','34','Boleto','[34]'::jsonb,'[{"dias":34,"percentual":100}]'::jsonb,true,0,false,17),
  ('p-40','40','Boleto','[40]'::jsonb,'[{"dias":40,"percentual":100}]'::jsonb,true,0,false,18),
  ('p-46','46','Boleto','[46]'::jsonb,'[{"dias":46,"percentual":100}]'::jsonb,true,0,false,19),
  ('p-52','52','Boleto','[52]'::jsonb,'[{"dias":52,"percentual":100}]'::jsonb,true,0,false,20),
  ('p-58','58','Boleto','[58]'::jsonb,'[{"dias":58,"percentual":100}]'::jsonb,true,0,false,21),
  ('p-60','60','Boleto','[60]'::jsonb,'[{"dias":60,"percentual":100}]'::jsonb,true,0,false,22),
  ('p-75','75','Boleto','[75]'::jsonb,'[{"dias":75,"percentual":100}]'::jsonb,true,0,false,23),
  ('p-90','90','Boleto','[90]'::jsonb,'[{"dias":90,"percentual":100}]'::jsonb,true,0,false,24),
  ('p-28-34','28 + 34','Boleto','[28,34]'::jsonb,'[{"dias":28,"percentual":50},{"dias":34,"percentual":50}]'::jsonb,true,0,false,25),
  ('p-28-34-40','28 + 34 + 40','Boleto','[28,34,40]'::jsonb,'[{"dias":28,"percentual":33.33},{"dias":34,"percentual":33.33},{"dias":40,"percentual":33.34}]'::jsonb,true,0,false,26),
  ('p-28-34-46','28 + 34 + 46','Boleto','[28,34,46]'::jsonb,'[{"dias":28,"percentual":33.33},{"dias":34,"percentual":33.33},{"dias":46,"percentual":33.34}]'::jsonb,true,0,false,27),
  ('p-28-34-46-52','28 + 34 + 46 + 52','Boleto','[28,34,46,52]'::jsonb,'[{"dias":28,"percentual":25},{"dias":34,"percentual":25},{"dias":46,"percentual":25},{"dias":52,"percentual":25}]'::jsonb,true,0,false,28),
  ('p-28-34-46-52-58','28 + 34 + 46 + 52 + 58','Boleto','[28,34,46,52,58]'::jsonb,'[{"dias":28,"percentual":20},{"dias":34,"percentual":20},{"dias":46,"percentual":20},{"dias":52,"percentual":20},{"dias":58,"percentual":20}]'::jsonb,true,0,false,29),
  ('p-30','30','Boleto','[30]'::jsonb,'[{"dias":30,"percentual":100}]'::jsonb,true,0,false,30),
  ('p-30-45','30 + 45','Boleto','[30,45]'::jsonb,'[{"dias":30,"percentual":50},{"dias":45,"percentual":50}]'::jsonb,true,0,false,31),
  ('p-30-45-60','30 + 45 + 60','Boleto','[30,45,60]'::jsonb,'[{"dias":30,"percentual":33.33},{"dias":45,"percentual":33.33},{"dias":60,"percentual":33.34}]'::jsonb,true,0,false,32),
  ('p-30-45-60-75','30 + 45 + 60 + 75','Boleto','[30,45,60,75]'::jsonb,'[{"dias":30,"percentual":25},{"dias":45,"percentual":25},{"dias":60,"percentual":25},{"dias":75,"percentual":25}]'::jsonb,true,0,false,33),
  ('p-30-45-60-75-90','30 + 45 + 60 + 75 + 90','Boleto','[30,45,60,75,90]'::jsonb,'[{"dias":30,"percentual":20},{"dias":45,"percentual":20},{"dias":60,"percentual":20},{"dias":75,"percentual":20},{"dias":90,"percentual":20}]'::jsonb,true,0,false,34),
  ('p-30-60-90','30 + 60 + 90','Boleto','[30,60,90]'::jsonb,'[{"dias":30,"percentual":33.33},{"dias":60,"percentual":33.33},{"dias":90,"percentual":33.34}]'::jsonb,true,0,false,35),
  ('p-ato-30-60-90','Ato + 30 + 60 + 90','Boleto','[0,30,60,90]'::jsonb,'[{"dias":0,"percentual":25},{"dias":30,"percentual":25},{"dias":60,"percentual":25},{"dias":90,"percentual":25}]'::jsonb,true,0,false,36),
  ('p-28-56-84','28 + 56 + 84','Boleto','[28,56,84]'::jsonb,'[{"dias":28,"percentual":33.33},{"dias":56,"percentual":33.33},{"dias":84,"percentual":33.34}]'::jsonb,true,0,false,37)
ON CONFLICT (id) DO UPDATE SET label=EXCLUDED.label, method=EXCLUDED.method, splits=EXCLUDED.splits, parcelas=EXCLUDED.parcelas, active=true, acrescimo_percent=0, permite_pf=EXCLUDED.permite_pf, ordem=EXCLUDED.ordem, updated_at=now();

-- ITEM 3 — aposenta o catálogo antigo (sem apagar nada)
UPDATE public.condicoes_pagamento SET active=false, updated_at=now() WHERE id NOT IN ('p-avista','p-ato-7','p-ato-7-14','p-ato-7-14-21','p-ato-7-14-21-28','p-ato-15','p-ato-15-30','p-ato-15-30-45','p-7','p-7-14','p-7-14-21','p-7-14-21-28','p-15','p-15-30','p-15-30-45','p-28','p-34','p-40','p-46','p-52','p-58','p-60','p-75','p-90','p-28-34','p-28-34-40','p-28-34-46','p-28-34-46-52','p-28-34-46-52-58','p-30','p-30-45','p-30-45-60','p-30-45-60-75','p-30-45-60-75-90','p-30-60-90','p-ato-30-60-90','p-28-56-84');