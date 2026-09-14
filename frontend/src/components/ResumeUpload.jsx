import { useRef, useState } from 'react';
import styled from 'styled-components';
import { uploadResume } from '../api.js';

const Row = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: ${({ theme }) => theme.colors.textDim};
`;

const Chip = styled.button`
  background: ${({ theme }) => theme.colors.panel};
  border: 1px solid ${({ theme }) => theme.colors.panelBorder};
  color: ${({ theme }) => theme.colors.cyan};
  font-size: 12px;
  padding: 5px 10px;
  border-radius: 999px;
  cursor: pointer;

  &:hover {
    border-color: ${({ theme }) => theme.colors.cyan};
  }

  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
`;

export default function ResumeUpload({ hasResume, onUploaded }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const profile = await uploadResume(file);
      onUploaded?.(profile);
    } catch (err) {
      onUploaded?.(null, err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Row>
      <Chip type="button" disabled={busy} onClick={() => inputRef.current?.click()}>
        {busy ? 'Reading resume…' : hasResume ? 'Update resume' : 'Upload resume'}
      </Chip>
      {hasResume && <span>Resume on file</span>}
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.txt"
        hidden
        onChange={handleFile}
      />
    </Row>
  );
}
