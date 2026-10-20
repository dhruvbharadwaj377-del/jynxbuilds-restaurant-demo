function Footer() {
  return (
    <footer className="footer">
      <div className="footer-top">
        <div className="footer-brand">
          <p className="footer-logo">MAISON NOIR</p>

          <p className="footer-tagline">
            An evening worth remembering.
          </p>
        </div>

        <div className="footer-links">
          <div>
            <span>EXPLORE</span>
            <a href="#story">Our Story</a>
            <a href="#menu">Menu</a>
            <a href="#gallery">Gallery</a>
            <a href="#reservation">Reservations</a>
          </div>

          <div>
            <span>CONTACT</span>
            <p className="footer-demo">
              Concept demonstration only — no real reservations are accepted or sent.
            </p>
          </div>
        </div>
      </div>

      <p className="footer-disclaimer">
        Maison Noir is a fictional concept project by JynxBuilds. This demonstration is not an operating restaurant
        and does not accept real reservations.
      </p>

      <div className="footer-bottom">
        <span>© 2026 MAISON NOIR</span>
        <span>PARIS · FRANCE</span>
        <span>ALL RIGHTS RESERVED</span>
      </div>
    </footer>
  );
}

export default Footer;