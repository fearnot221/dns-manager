import Image from "next/image";

export function Brand() {
  return <><span className="brandmark"><Image src="/ncu-emblem.png" alt="國立中央大學校徽" width={56} height={56} unoptimized /></span><span className="brand-name"><strong>NCUEECESNMG</strong><span>DNS Manager</span></span></>;
}
