import Image from "next/image";

interface Props {
  width?: number;
  height?: number;
  className?: string;
}

export default function BandejaLogo({ width = 140, height = 34, className }: Props) {
  return (
    <Image
      src="/bandeja-logo.png"
      alt="Bandeja"
      width={width}
      height={height}
      className={className}
      style={{ objectFit: "contain" }}
    />
  );
}
