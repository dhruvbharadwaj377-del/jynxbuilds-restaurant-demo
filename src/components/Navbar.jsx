import { useEffect, useState } from "react";

function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 80);
    };

    window.addEventListener("scroll", handleScroll);
    handleScroll();

    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  const closeMenu = () => {
    setMenuOpen(false);
  };

  return (
    <header
      className={`navbar ${scrolled ? "navbar-scrolled" : ""} ${
        menuOpen ? "menu-open" : ""
      }`}
    >
      <a href="#" className="logo" onClick={closeMenu}>
        MAISON NOIR
      </a>

      <nav className="nav-links">
        <a href="#story">Our Story</a>
        <a href="#menu">Menu</a>
        <a href="#gallery">Gallery</a>
      </nav>

      <a
        href="#reservation"
        className="reservation-button desktop-reservation"
      >
        Reserve a Table
      </a>

      <button
        className="menu-toggle"
        onClick={() => setMenuOpen(!menuOpen)}
        aria-label="Toggle navigation"
        aria-expanded={menuOpen}
      >
        <span></span>
        <span></span>
      </button>

      <div className="mobile-menu">
        <a href="#story" onClick={closeMenu}>
          Our Story
        </a>

        <a href="#menu" onClick={closeMenu}>
          Menu
        </a>

        <a href="#gallery" onClick={closeMenu}>
          Gallery
        </a>

        <a href="#reservation" onClick={closeMenu}>
          Reserve a Table
        </a>
      </div>
    </header>
  );
}

export default Navbar;