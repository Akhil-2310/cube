export type PetMood = "idle" | "waiting" | "happy" | "sleeping" | "winner";

export function PixelPet({ mood = "idle", label }: { mood?: PetMood; label?: string }) {
  return (
    <div className={`pixel-pet mood-${mood}`} aria-hidden={label ? undefined : true}>
      <div className="pet-sprite">
        <div className="pet-body">
          <span className="ear left" />
          <span className="ear right" />
          <span className="blush left" />
          <span className="blush right" />
          <span className="eye left" />
          <span className="eye right" />
          <span className="mouth" />
        </div>
        <div className="pet-feet">
          <span />
          <span />
        </div>
      </div>
      {label ? <p className="pet-caption">{label}</p> : null}
    </div>
  );
}
