import React, { useState, useRef, useEffect } from 'react';
import { Tag } from '@/types';
import { useFinance } from '@/context/FinanceContext';
import styles from './TagSelector.module.css';

interface TagSelectorProps {
  selectedTagIds: string[];
  onChange: (tagIds: string[]) => void;
}

const TagSelector: React.FC<TagSelectorProps> = ({ selectedTagIds, onChange }) => {
  const { tags, addTag } = useFinance();
  const [inputValue, setInputValue] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedTags = tags.filter(t => selectedTagIds.includes(t.id));

  const availableTags = tags.filter(
    t => !selectedTagIds.includes(t.id) && t.name.toLowerCase().includes(inputValue.toLowerCase())
  );

  const handleSelectTag = (tagId: string) => {
    onChange([...selectedTagIds, tagId]);
    setInputValue('');
    setIsDropdownOpen(false);
  };

  const handleRemoveTag = (tagId: string) => {
    onChange(selectedTagIds.filter(id => id !== tagId));
  };

  const handleCreateTag = async () => {
    const name = inputValue.trim();
    if (!name) return;

    setIsCreating(true);
    const newTag = await addTag(name);
    if (newTag) {
      onChange([...selectedTagIds, newTag.id]);
    }
    setInputValue('');
    setIsDropdownOpen(false);
    setIsCreating(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (inputValue.trim() && !tags.some(t => t.name.toLowerCase() === inputValue.trim().toLowerCase())) {
        handleCreateTag();
      } else if (availableTags.length > 0) {
        handleSelectTag(availableTags[0].id);
      }
    } else if (e.key === 'Backspace' && !inputValue && selectedTagIds.length > 0) {
      handleRemoveTag(selectedTagIds[selectedTagIds.length - 1]);
    }
  };

  const canCreate = inputValue.trim() &&
    !tags.some(t => t.name.toLowerCase() === inputValue.trim().toLowerCase());

  return (
    <div className={styles.container} ref={wrapperRef}>
      <label className={styles.label}>แท็ก</label>
      <div
        className={styles.inputWrapper}
        onClick={() => setIsDropdownOpen(true)}
      >
        {selectedTags.map(tag => (
          <span
            key={tag.id}
            className={styles.tag}
            style={tag.color ? { backgroundColor: tag.color + '20', color: tag.color } : undefined}
          >
            {tag.name}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); handleRemoveTag(tag.id); }}
              className={styles.removeBtn}
            >
              ×
            </button>
          </span>
        ))}
        <input
          type="text"
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            setIsDropdownOpen(true);
          }}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsDropdownOpen(true)}
          placeholder={selectedTagIds.length === 0 ? 'เพิ่มแท็ก...' : ''}
          className={styles.input}
          disabled={isCreating}
        />
      </div>

      {isDropdownOpen && (inputValue || availableTags.length > 0) && (
        <div className={styles.dropdown}>
          {availableTags.map(tag => (
            <button
              key={tag.id}
              type="button"
              onClick={() => handleSelectTag(tag.id)}
              className={styles.option}
            >
              <span>{tag.name}</span>
            </button>
          ))}
          {canCreate && (
            <button
              type="button"
              onClick={handleCreateTag}
              className={styles.createOption}
              disabled={isCreating}
            >
              {isCreating ? 'กำลังสร้าง...' : `สร้าง "${inputValue.trim()}"`}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default TagSelector;