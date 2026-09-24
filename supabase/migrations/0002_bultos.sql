-- ============================================================================
-- Añade número y tipo de bultos a expediciones. Contenido exigido por el
-- art. 10 Ley 15/2009 (naturaleza de la mercancía y su embalaje; número de
-- bultos, marcas y contraseñas), heredado del art. 6 CMR — se echaba en
-- falta junto a naturaleza_mercancia/peso_kg, con los que comparte fila
-- porque son datos comunes al DeCA y a la carta de porte, no exclusivos del
-- art. 10 bis (que solo regula la identificación del porteador efectivo).
-- ============================================================================

alter table deca.expediciones
  add column numero_bultos integer,
  add column tipo_bultos text;
