import Navbar from "./components/Navbar";
import Hero from "./components/Hero";
import Story from "./components/Story";
import SignatureDishes from "./components/SignatureDishes";
import Gallery from "./components/Gallery";
import Reservation from "./components/Reservation";
import Footer from "./components/Footer";

function App() {
  return (
    <>
      <Navbar />
      <Hero />
      <Story />
      <SignatureDishes />
      <Gallery />
      <Reservation />
      <Footer />
    </>
  );
}

export default App;