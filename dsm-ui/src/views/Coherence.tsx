import React from 'react';
import { useClusterData } from '../hooks/useClusterData';
import { PageTable } from '../components/coherence/PageTable';
import { MsiDiagram } from '../components/coherence/MsiDiagram';

export function CoherenceView() {
  const { msiPages } = useClusterData();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      <div className="lg:col-span-8">
        <PageTable pages={msiPages} />
      </div>
      <div className="lg:col-span-4">
        <MsiDiagram pages={msiPages} />
      </div>
    </div>
  );
}
