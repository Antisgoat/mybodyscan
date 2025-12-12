import { Seo } from "@/components/Seo";

const Disclaimer = () => {
  return (
    <>
      <Seo
        title="Disclaimer – MyBodyScan"
        description="Health information notice"
        canonical="https://mybodyscanapp.com/legal/disclaimer"
      />
      <article className="prose prose-neutral dark:prose-invert max-w-none">
        <h1>Health Disclaimer</h1>
        <p>
          Not medical advice; see a doctor if under 18, pregnant or
          breastfeeding, with eating disorder history, heart/kidney/liver
          disease, diabetes on medication, or recent surgery.
        </p>
        <p>
          Stop and seek emergency care if chest pain, fainting, or severe
          dizziness. Calorie bounds are enforced.
        </p>
      </article>
    </>
  );
};

export default Disclaimer;
