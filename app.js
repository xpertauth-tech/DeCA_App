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

// TODO Fase 1: formulario de creación de expedición (art. 6 + autocompletado
// desde el directorio de contactos frecuentes).
// TODO Fase 2: generación de PDF nativo + slug único + QR (Edge Function).
// TODO Fase 3: envío por WhatsApp/Telegram (enlaces wa.me / t.me) y por
// email a la contraparte (Edge Function + Resend).
