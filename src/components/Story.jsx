function Story() {
  return (
    <section className="story" id="story">
      <div className="story-image">
        <img src="/images/story.jpg" alt="Maison Noir interior" />
      </div>

      <div className="story-content">
        <p className="section-label">OUR STORY</p>

        <h2>
          Where every
          <br />
          <span>detail matters.</span>
        </h2>

        <p className="story-text">
          Maison Noir is an intimate dining experience shaped by
          contemporary French cuisine, thoughtful ingredients, and an
          atmosphere designed to slow the evening down.
        </p>

        <p className="story-text">
          From the first pour to the final course, everything has its
          place. Nothing is rushed. Nothing is accidental.
        </p>

        <a href="#menu" className="text-link">
          Discover our philosophy →
        </a>
      </div>
    </section>
  );
}

export default Story;