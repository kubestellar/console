// Rough-sketch corner brackets rendered around a card when it is displaying
// demo/mock data. Extracted from CardWrapper for readability (#22959).
export function CardDemoBrackets() {
  return (
    <>
      <svg className="absolute -top-px -left-px w-5 h-5 pointer-events-none z-10" viewBox="0 0 20 20" fill="none">
        <defs><filter id="demo-rough"><feTurbulence type="turbulence" baseFrequency="0.04" numOctaves="4" result="noise" /><feDisplacementMap in="SourceGraphic" in2="noise" scale="1" /></filter></defs>
        <path d="M2 17 V9 C2 4.5 4.5 2 9 2 H17" stroke="rgb(234 179 8 / 0.4)" strokeWidth="2.5" strokeLinecap="round" fill="none" filter="url(#demo-rough)" />
      </svg>
      <svg className="absolute -top-px -right-px w-5 h-5 pointer-events-none z-10" viewBox="0 0 20 20" fill="none">
        <path d="M18 17 V9 C18 4.5 15.5 2 11 2 H3" stroke="rgb(234 179 8 / 0.4)" strokeWidth="2.5" strokeLinecap="round" fill="none" filter="url(#demo-rough)" />
      </svg>
      <svg className="absolute -bottom-px -left-px w-5 h-5 pointer-events-none z-10" viewBox="0 0 20 20" fill="none">
        <path d="M2 3 V11 C2 15.5 4.5 18 9 18 H17" stroke="rgb(234 179 8 / 0.4)" strokeWidth="2.5" strokeLinecap="round" fill="none" filter="url(#demo-rough)" />
      </svg>
      <svg className="absolute -bottom-px -right-px w-5 h-5 pointer-events-none z-10" viewBox="0 0 20 20" fill="none">
        <path d="M18 3 V11 C18 15.5 15.5 18 11 18 H3" stroke="rgb(234 179 8 / 0.4)" strokeWidth="2.5" strokeLinecap="round" fill="none" filter="url(#demo-rough)" />
      </svg>
    </>
  )
}
