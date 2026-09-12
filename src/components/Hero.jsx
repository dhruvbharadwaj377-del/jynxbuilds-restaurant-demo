import { useEffect, useRef } from "react";

function Hero() {
  const heroImageRef = useRef(null);

  useEffect(() => {
    const handleMouseMove = (event) => {
      if (window.innerWidth <= 900) return;

      const x = (event.clientX / window.innerWidth - 0.5) * 2;
      const y = (event.clientY / window.innerHeight - 0.5) * 2;

      const moveX = x * 8;
      const moveY = y * 5;

      if (heroImageRef.current) {
        heroImageRef.current.style.transform = `
          scale(1.04)
          translate3d(${moveX}px, ${moveY}px, 0)
        `;
      }
    };

    const resetPosition = () => {
      if (heroImageRef.current) {
        heroImageRef.current.style.transform =
          "scale(1.04) translate3d(0, 0, 0)";
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseleave", resetPosition);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseleave", resetPosition);
    };
  }, []);

  return (
    <section className="hero">
      <div ref={heroImageRef} className="hero-image" />

      <div className="hero-overlay" />

      <div className="hero-content">
        <p className="hero-eyebrow">CONTEMPORARY FINE DINING</p>

        <h1>
          MAISON
          <br />
          <span>NOIR</span>
        </h1>

        <p className="hero-tagline">
          An evening worth remembering.
        </p>

        <div className="hero-actions">
          <a href="#menu" className="hero-button hero-button-filled">
            Explore the Menu
          </a>

          <a href="#reservation" className="hero-button">
            Reserve a Table
          </a>
        </div>
      </div>

      <div className="hero-bottom">
        <span>PARIS · EST. 2026</span>
        <span>SCROLL TO DISCOVER ↓</span>
      </div>
    </section>
  );
}

export default Hero;