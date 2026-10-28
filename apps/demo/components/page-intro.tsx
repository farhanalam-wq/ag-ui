type PageIntroProps = {
  title: string;
  description: string;
  image?: string;
  imageAlt?: string;
};

export function PageIntro({ title, description, image, imageAlt }: PageIntroProps) {
  return (
    <section className={`page-intro${image ? " page-intro-with-image" : ""}`}>
      <div className="container page-intro-inner">
        <div className="page-intro-copy">
          <p className="eyebrow">Alderwick Advisory / {title}</p>
          <h1>{title}</h1>
          <p className="intro-description">{description}</p>
        </div>
        {image ? (
          <div
            className="page-intro-image"
            role="img"
            aria-label={imageAlt}
            style={{ backgroundImage: `linear-gradient(90deg, rgba(12, 34, 31, .08), rgba(12, 34, 31, .1)), url("${image}")` }}
          />
        ) : null}
      </div>
    </section>
  );
}
