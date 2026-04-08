import React, { useState, useEffect, useCallback } from 'react';
import type { SpotSessionConfig } from '../../../shared/types';
import type { SpotConfig } from '../../../main/spot-trainer/spot-config';

interface SpotSelectorProps {
  playerName: string;
  onStart: (config: SpotSessionConfig) => void;
  onBack: () => void;
}

type HeroSide = 'IP' | 'OOP';
type PotType = 'SRP' | '3BP' | '4BP';

const POT_TYPE_LABELS: Record<PotType, string> = {
  SRP: 'Single Raised Pot',
  '3BP': '3-Bet Pot',
  '4BP': '4-Bet Pot',
};

export function SpotSelector({
  playerName, onStart, onBack
}: SpotSelectorProps): React.JSX.Element {
  const [catalog, setCatalog] = useState<SpotConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiStatus, setApiStatus] = useState<'checking' | 'ok' | 'error'>('checking');
  const [selectedSpotId, setSelectedSpotId] = useState<string | null>(null);
  const [heroSide, setHeroSide] = useState<HeroSide>('IP');
  const [tableCount, setTableCount] = useState(1);
  const [expandedType, setExpandedType] = useState<PotType>('SRP');

  // Load catalog on mount
  useEffect(() => {
    setLoading(true);
    window.grindSim.getSpotCatalog()
      .then(spots => {
        setCatalog(spots);
        setApiStatus(spots.length > 0 ? 'ok' : 'error');
        if (spots.length > 0) {
          setSelectedSpotId(spots[0].id);
        }
      })
      .catch(() => setApiStatus('error'))
      .finally(() => setLoading(false));
  }, []);

  const grouped = catalog.reduce<Record<PotType, SpotConfig[]>>((acc, spot) => {
    const type = spot.potType as PotType;
    if (!acc[type]) acc[type] = [];
    acc[type].push(spot);
    return acc;
  }, {} as Record<PotType, SpotConfig[]>);

  const selectedSpot = catalog.find(s => s.id === selectedSpotId) ?? null;

  const handleStart = useCallback(() => {
    if (!selectedSpot) return;
    onStart({
      spotId: selectedSpot.id,
      heroSide,
      tableCount,
      playerName,
    });
  }, [selectedSpot, heroSide, tableCount, playerName, onStart]);

  return (
    <div style={{
      width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column',
      background: '#1a1a2e', color: '#fff', fontFamily: '"Segoe UI", system-ui, sans-serif',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', padding: '20px 32px',
        borderBottom: '1px solid #2a2a4a', gap: 16,
      }}>
        <button
          onClick={onBack}
          style={{
            padding: '8px 16px', borderRadius: 6, border: '1px solid #444',
            background: '#16213e', color: '#a0a0b0', fontSize: 14, cursor: 'pointer',
          }}
        >
          ← Back
        </button>
        <h2 style={{ margin: 0, color: '#ffd700', fontSize: 24, fontWeight: 900, letterSpacing: 2 }}>
          SPOT TRAINER
        </h2>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 10, height: 10, borderRadius: '50%',
            background: apiStatus === 'ok' ? '#33aa55' : apiStatus === 'checking' ? '#ffcc00' : '#cc3333',
          }} />
          <span style={{ color: '#a0a0b0', fontSize: 13 }}>
            {apiStatus === 'ok' ? 'API connected' : apiStatus === 'checking' ? 'Connecting...' : 'API unavailable'}
          </span>
        </div>
      </div>

      {/* Main content */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left: Spot list */}
        <div style={{
          width: 340, borderRight: '1px solid #2a2a4a',
          overflowY: 'auto', padding: '16px 0',
        }}>
          {loading ? (
            <div style={{ textAlign: 'center', color: '#a0a0b0', padding: 32 }}>
              Loading spots...
            </div>
          ) : catalog.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#a0a0b0', padding: 32, fontSize: 13 }}>
              No spots available.<br />
              Configure the postflop API URL in Settings,<br />
              and ensure preflop range files are loaded.
            </div>
          ) : (
            (['SRP', '3BP', '4BP'] as PotType[]).map(type => {
              const spots = grouped[type];
              if (!spots?.length) return null;
              const isExpanded = expandedType === type;
              return (
                <div key={type}>
                  <button
                    onClick={() => setExpandedType(isExpanded ? type : type)}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center',
                      justifyContent: 'space-between', padding: '10px 20px',
                      background: isExpanded ? '#16213e' : 'transparent',
                      border: 'none', color: '#ffd700', fontSize: 13, fontWeight: 700,
                      letterSpacing: 1, cursor: 'pointer', textAlign: 'left',
                    }}
                  >
                    <span>{POT_TYPE_LABELS[type]}</span>
                    <span style={{ color: '#555' }}>{spots.length} spots</span>
                  </button>
                  {isExpanded && spots.map(spot => (
                    <button
                      key={spot.id}
                      onClick={() => setSelectedSpotId(spot.id)}
                      style={{
                        width: '100%', padding: '10px 28px', border: 'none', textAlign: 'left',
                        background: selectedSpotId === spot.id ? '#0d4a9c' : 'transparent',
                        color: selectedSpotId === spot.id ? '#fff' : '#a0a0b0',
                        fontSize: 14, cursor: 'pointer',
                        borderLeft: selectedSpotId === spot.id ? '3px solid #ffd700' : '3px solid transparent',
                      }}
                    >
                      {spot.label}
                    </button>
                  ))}
                </div>
              );
            })
          )}
        </div>

        {/* Right: Config panel */}
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 32, padding: 48,
        }}>
          {selectedSpot ? (
            <>
              <div style={{ textAlign: 'center' }}>
                <h3 style={{ margin: 0, fontSize: 28, fontWeight: 900, color: '#ffd700' }}>
                  {selectedSpot.label}
                </h3>
              </div>

              {/* Hero Side */}
              <div style={{ textAlign: 'center' }}>
                <div style={{ color: '#a0a0b0', fontSize: 13, marginBottom: 10 }}>
                  PLAY AS
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {(['IP', 'OOP'] as HeroSide[]).map(side => (
                    <button
                      key={side}
                      onClick={() => setHeroSide(side)}
                      style={{
                        padding: '10px 28px', borderRadius: 6, border: 'none', fontSize: 15,
                        fontWeight: 700, cursor: 'pointer',
                        background: heroSide === side ? '#ffd700' : '#16213e',
                        color: heroSide === side ? '#1a1a2e' : '#a0a0b0',
                      }}
                    >
                      {side} ({side === 'IP' ? selectedSpot.ipPosition : selectedSpot.oopPosition})
                    </button>
                  ))}
                </div>
              </div>

              {/* Table count */}
              <div style={{ textAlign: 'center' }}>
                <div style={{ color: '#a0a0b0', fontSize: 13, marginBottom: 10 }}>
                  TABLES
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
                    <button
                      key={n}
                      onClick={() => setTableCount(n)}
                      style={{
                        width: 38, height: 38, borderRadius: 6, border: 'none', fontSize: 15,
                        fontWeight: 700, cursor: 'pointer',
                        background: n === tableCount ? '#ffd700' : '#16213e',
                        color: n === tableCount ? '#1a1a2e' : '#a0a0b0',
                      }}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              {/* Start button */}
              <button
                onClick={handleStart}
                disabled={apiStatus === 'error'}
                style={{
                  padding: '16px 64px', borderRadius: 8, border: 'none', fontSize: 20,
                  fontWeight: 900, cursor: apiStatus === 'error' ? 'not-allowed' : 'pointer',
                  letterSpacing: 2,
                  background: apiStatus === 'error' ? '#444' : '#33aa55',
                  color: '#fff',
                  opacity: apiStatus === 'error' ? 0.6 : 1,
                }}
              >
                START DRILLING
              </button>

              {apiStatus === 'error' && (
                <p style={{ color: '#cc3333', fontSize: 13, margin: 0, textAlign: 'center' }}>
                  Postflop API unavailable.<br />
                  Configure the API URL in Settings to enable spot training.
                </p>
              )}
            </>
          ) : (
            <p style={{ color: '#a0a0b0', fontSize: 15 }}>
              Select a spot from the list to begin.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
