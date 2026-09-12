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
            <a href="mailto:hello@maisonnoir.com">
              hello@maisonnoir.com
            </a>
            <a href="tel:+33100000000">
              +33 1 00 00 00 00
            </a>
          </div>
        </div>
      </div>

      <div className="footer-bottom">
        <span>© 2026 MAISON NOIR</span>
        <span>PARIS · FRANCE</span>
        <span>ALL RIGHTS RESERVED</span>
      </div>
    </footer>
  );
}

export default Footer;