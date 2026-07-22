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
          MyBodyScan provides general wellness information. It does not provide
          medical advice, diagnosis, treatment, or emergency services. Body
          composition, weight, nutrition, food, and other outputs are estimates
          or calculations and may be inaccurate.
        </p>
        <p>
          Visual observations describe visible image features and do not measure
          exact regional fat. A transformation preview is a motivational
          illustration, not a prediction or guarantee of future appearance.
        </p>
        <p>
          Consult a qualified professional before changing exercise or
          nutrition, especially if you are under 18, pregnant or breastfeeding,
          have an eating-disorder history, take medication, recently had
          surgery, or have a medical condition. Stop activity and seek urgent or
          emergency care for chest pain, fainting, severe dizziness, trouble
          breathing, or other serious symptoms.
        </p>
      </article>
    </>
  );
};

export default Disclaimer;
