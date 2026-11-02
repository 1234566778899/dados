import { Roller } from "@/components/Roller";
import { SITE_URL } from "@/lib/site";

const faq = [
  {
    question: "¿Los resultados son realmente aleatorios?",
    answer:
      "Sí. Cada cara sale de crypto.getRandomValues, el generador criptográfico de tu navegador, con probabilidad exacta de 1 entre 6. El resultado se decide antes de que el dado se mueva: la animación solo lo muestra.",
  },
  {
    question: "¿Para qué juegos sirve?",
    answer:
      "Para cualquier juego que use dados de 6 caras: parchís, Monopoly, Yahtzee, generala, Risk, juegos de mesa con amigos o clases. Puedes lanzar de 1 a 6 dados a la vez y ver la suma al instante.",
  },
  {
    question: "¿Puedo volver a lanzar solo algunos dados?",
    answer:
      "Sí. Después de una tirada toca los dados que quieras guardar y solo se lanzarán los demás, como en Yahtzee o generala.",
  },
  {
    question: "¿Tiene anuncios o pide registrarse?",
    answer:
      "No. No hay publicidad, registro ni rastreadores. El historial y tus preferencias se guardan solo en tu dispositivo y puedes borrarlos cuando quieras.",
  },
  {
    question: "¿Funciona sin internet?",
    answer:
      "Sí. Después de la primera visita el dado sigue funcionando sin conexión, y puedes instalarlo en tu móvil como una aplicación.",
  },
];

const jsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "Tirada",
    url: `${SITE_URL}/`,
    description: "Dado virtual 3D para lanzar de 1 a 6 dados online, gratis y sin anuncios.",
    applicationCategory: "GameApplication",
    operatingSystem: "Web",
    inLanguage: "es",
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  },
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map(({ question, answer }) => ({
      "@type": "Question",
      name: question,
      acceptedAnswer: { "@type": "Answer", text: answer },
    })),
  },
];

export default function Page() {
  return (
    <>
      <Roller />
      <article id="acerca" className="info">
        <h1>Lanzar dados online</h1>
        <p className="info-lead">
          Tirada es un dado virtual 3D con física real, gratis y sin anuncios. Abre la página, pulsa Lanzar y mira cómo
          ruedan los dados sobre la mesa.
        </p>

        <h2>Cómo lanzar los dados</h2>
        <ol>
          <li>Elige cuántos dados quieres usar, de 1 a 6.</li>
          <li>
            Pulsa <strong>Lanzar</strong>, toca la mesa o usa la barra espaciadora.
          </li>
          <li>Lee el total y, si tu juego lo pide, guarda dados antes de volver a lanzar.</li>
        </ol>
        <p>
          En el teclado, <kbd>Espacio</kbd> lanza y las teclas <kbd>1</kbd> a <kbd>6</kbd> eligen la cantidad de dados.
        </p>

        <h2>Preguntas frecuentes</h2>
        {faq.map(({ question, answer }) => (
          <section key={question}>
            <h3>{question}</h3>
            <p>{answer}</p>
          </section>
        ))}
      </article>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
    </>
  );
}
