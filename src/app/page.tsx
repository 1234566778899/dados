import { Roller } from "@/components/Roller";

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "Tirada",
  description: "Lanzador de dados 3D online, justo y sin anuncios.",
  applicationCategory: "GameApplication",
  operatingSystem: "Web",
  inLanguage: "es",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
};

function About() {
  return (
    <div className="about">
      <h3>Es justo</h3>
      <p>
        Cada cara sale de <code>crypto.getRandomValues</code>, el generador criptográfico de tu navegador, con
        probabilidad exacta de 1 entre 6. El resultado se decide antes de que el dado se mueva: la animación solo lo
        muestra.
      </p>
      <h3>Sin anuncios ni cuentas</h3>
      <p>No hay publicidad, registro ni rastreadores. Abres la página y lanzas.</p>
      <h3>Tus datos son tuyos</h3>
      <p>El historial y tus preferencias se guardan solo en este dispositivo. Puedes borrarlos cuando quieras.</p>
      <h3>Atajos</h3>
      <p>
        <kbd>Espacio</kbd> lanza. Las teclas <kbd>1</kbd> a <kbd>6</kbd> eligen cuántos dados usar.
      </p>
    </div>
  );
}

export default function Page() {
  return (
    <>
      <Roller about={<About />} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
    </>
  );
}
