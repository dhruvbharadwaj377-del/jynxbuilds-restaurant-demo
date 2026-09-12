function Gallery() {
  return (
    <section className="gallery" id="gallery">
      <div className="gallery-header">
        <p className="section-label">THE ATMOSPHERE</p>

        <h2>
          Come for the
          <br />
          <span>food. Stay for the feeling.</span>
        </h2>
      </div>

      <div className="gallery-grid">
        <div className="gallery-item gallery-item-large">
          <img
            src="/images/interior-01.jpg"
            alt="Maison Noir dining room"
          />
        </div>

        <div className="gallery-item gallery-item-small">
          <img
            src="/images/interior-02.jpg"
            alt="Maison Noir table setting"
          />
        </div>

        <div className="gallery-item gallery-item-small">
          <img
            src="/images/gallery-01.jpg"
            alt="Maison Noir dining detail"
          />
        </div>

        <div className="gallery-item gallery-item-wide">
          <img
            src="/images/gallery-02.jpg"
            alt="Maison Noir atmosphere"
          />
        </div>
      </div>

      <div className="gallery-chef">
        <div className="chef-image">
          <img
            src="/images/chef.jpg"
            alt="Maison Noir chef"
          />
        </div>

        <div className="chef-content">
          <p className="section-label">BEHIND THE CUISINE</p>

          <h3>
            Crafted with
            <br />
            <span>intention.</span>
          </h3>

          <p>
            Our kitchen is guided by respect for the ingredient and
            curiosity for what it can become. Every plate is composed
            to complement the room, the season, and the moment.
          </p>

          <p className="chef-signature">
            — Maison Noir
          </p>
        </div>
      </div>
    </section>
  );
}

export default Gallery;