function Reservation() {
  return (
    <section className="reservation" id="reservation">
      <div className="reservation-content">
        <p className="section-label">RESERVATIONS</p>

        <h2>
          Make an evening
          <br />
          <span>of it.</span>
        </h2>

        <p className="reservation-text">
          Join us for an evening of thoughtful cuisine, intimate
          surroundings, and moments worth lingering over.
        </p>

        <a href="mailto:reservations@maisonnoir.com" className="reservation-cta">
          Request a Reservation →
        </a>
      </div>

      <div className="reservation-meta">
        <div>
          <span>DINNER</span>
          <p>Tuesday — Saturday</p>
          <p>18:30 — 23:30</p>
        </div>

        <div>
          <span>LOCATION</span>
          <p>14 Rue de Noir</p>
          <p>Paris, France</p>
        </div>
      </div>
    </section>
  );
}

export default Reservation;