// DeCA_App — inicialización básica del cliente.
// El navegador solo usa la clave pública "anon": solo puede LEER un DeCA
// por su slug (política RLS en deca_documentos). Crear expediciones,
// generar documentos y enviar correos siempre pasa por una Edge Function
// con la service_role key, nunca desde aquí.

const supabaseClient =
  window.DECA_CONFIG &&
  window.supabase.createClient(
    window.DECA_CONFIG.SUPABASE_URL,
    window.DECA_CONFIG.SUPABASE_ANON_KEY
  );

async function cargarConfiguracionVisual() {
  if (!supabaseClient) {
    console.warn("Falta config.js — copia config.example.js y rellena tus datos de Supabase.");
    return;
  }

  const { data, error } = await supabaseClient
    .schema("deca")
    .from("configuracion")
    .select("empresa_nombre, logo_url")
    .eq("id", 1)
    .single();

  if (error) {
    console.warn("No se pudo cargar la configuración de la instancia:", error.message);
    return;
  }

  if (data.empresa_nombre) {
    document.getElementById("empresa-nombre").textContent = data.empresa_nombre;
  }
  if (data.logo_url) {
    document.getElementById("empresa-logo").src = data.logo_url;
  }
}

cargarConfiguracionVisual();

// --- Formulario de creación de expedición (Fase 1) -------------------------
// La escritura real (insertar en expediciones / cartas_porte) pasa siempre
// por una Edge Function con la service_role key, nunca desde el navegador
// (ver política RLS en supabase/migrations/0001_init.sql). Hasta que esa
// Edge Function esté desplegada, el formulario valida y muestra el payload
// que se enviaría, para poder probar los campos sin necesitar backend.

const formExpedicion = document.getElementById("form-expedicion");
const checkboxCartaPorte = document.getElementById("incluye_carta_porte");
const camposCartaPorte = document.getElementById("carta-porte-campos");
const resultadoSection = document.getElementById("resultado");
const resultadoNota = document.getElementById("resultado-nota");
const resultadoJson = document.getElementById("resultado-json");

checkboxCartaPorte.addEventListener("change", () => {
  const incluye = checkboxCartaPorte.checked;
  camposCartaPorte.hidden = !incluye;
  camposCartaPorte
    .querySelectorAll("[name='destinatario_nombre'], [name='destinatario_direccion']")
    .forEach((campo) => campo.required = incluye);
});

async function crearExpedicion(payload) {
  const endpoint = window.DECA_CONFIG && window.DECA_CONFIG.CREAR_EXPEDICION_URL;
  if (!endpoint) {
    return { guardado: false, motivo: "Backend no configurado todavía (falta desplegar la Edge Function crear-expedicion)." };
  }

  const respuesta = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${window.DECA_CONFIG.SUPABASE_ANON_KEY}`,
      "apikey": window.DECA_CONFIG.SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(payload),
  });

  if (!respuesta.ok) {
    const error = await respuesta.text();
    throw new Error(`La Edge Function respondió ${respuesta.status}: ${error}`);
  }

  return { guardado: true, ...(await respuesta.json()) };
}

formExpedicion.addEventListener("submit", async (evento) => {
  evento.preventDefault();

  if (!formExpedicion.reportValidity()) {
    return;
  }

  const datos = new FormData(formExpedicion);
  const payload = Object.fromEntries(datos.entries());
  payload.peso_indeterminado = datos.has("peso_indeterminado");
  payload.incluye_carta_porte = datos.has("incluye_carta_porte");

  let resultado;
  try {
    resultado = await crearExpedicion(payload);
  } catch (error) {
    resultado = { guardado: false, motivo: error.message };
  }

  resultadoNota.textContent = resultado.guardado
    ? "Expedición guardada correctamente."
    : `No se ha guardado todavía: ${resultado.motivo}`;
  resultadoJson.textContent = JSON.stringify(payload, null, 2);
  resultadoSection.hidden = false;
  resultadoSection.scrollIntoView({ behavior: "smooth", block: "start" });
});

// TODO Fase 1.1: autocompletado desde el directorio de contactos frecuentes
// (requiere una Edge Function de lectura, ya que "directorio" no tiene
// política RLS para "anon").
// TODO Fase 2: generación de PDF nativo + slug único + QR (Edge Function).
// TODO Fase 3: envío por WhatsApp/Telegram (enlaces wa.me / t.me) y por
// email a la contraparte (Edge Function + Resend).
