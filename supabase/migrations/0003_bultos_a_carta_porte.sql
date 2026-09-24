-- ============================================================================
-- Corrige la ubicación de numero_bultos/tipo_bultos: la 0002 las puso en
-- expediciones (común al DeCA), pero el DeCA (art. 6 Orden FOM/2861/2012)
-- no exige el embalaje de la mercancía — solo la carta de porte lo exige
-- (art. 10 Ley 15/2009). Se mueven a cartas_porte, junto con el resto de
-- contenido exclusivo de la carta de porte (lugar_carga/entrega, precio).
-- ============================================================================

alter table deca.expediciones
  drop column numero_bultos,
  drop column tipo_bultos;

alter table deca.cartas_porte
  add column numero_bultos integer,
  add column tipo_bultos text;
