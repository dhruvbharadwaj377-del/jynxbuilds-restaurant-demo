function SignatureDishes() {
  return (
    <section className="dishes" id="menu">
      <div className="dishes-header">
        <div>
          <p className="section-label">FROM THE KITCHEN</p>

          <h2>
            Signature
            <br />
            <span>creations.</span>
          </h2>
        </div>

        <p className="dishes-intro">
          A selection of dishes that define the Maison Noir experience.
          Seasonal ingredients, classical technique, and a little
          imagination.
        </p>
      </div>

      <div className="dishes-grid">
        <article className="dish dish-large">
          <div className="dish-image">
            <img
              src="./images/dish-01.jpg"
              alt="Maison Noir signature pasta"
            />
          </div>

          <div className="dish-info">
            <span>01</span>

            <div>
              <h3>Tagliolini Noir</h3>
              <p>Black truffle · Parmesan · Wild mushroom</p>
            </div>

            <span>₹1,850</span>
          </div>
        </article>

        <article className="dish">
          <div className="dish-image">
            <img
              src="./images/dish-02.jpg"
              alt="Maison Noir main course"
            />
          </div>

          <div className="dish-info">
            <span>02</span>

            <div>
              <h3>Le Filet</h3>
              <p>Roasted tenderloin · Jus · Seasonal vegetables</p>
            </div>

            <span>₹2,650</span>
          </div>
        </article>

        <article className="dish">
          <div className="dish-image">
            <img
              src="./images/dish-03.jpg"
              alt="Maison Noir dessert"
            />
          </div>

          <div className="dish-info">
            <span>03</span>

            <div>
              <h3>Chocolat Noir</h3>
              <p>Dark chocolate · Hazelnut · Fleur de sel</p>
            </div>

            <span>₹1,250</span>
          </div>
        </article>
      </div>

      <div className="dishes-footer">
        <a href="#reservation" className="text-link">
          View the full menu →
        </a>
      </div>
    </section>
  );
}

export default SignatureDishes;