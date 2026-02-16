import React, { useState, useRef, useEffect } from 'react';
import styles from './TagSelector.module.css';

interface TagSelectorProps {
  selectedTags: string[];
  onChange: (tags: string[]) => void;
  availableTags: string[];
}

const TagSelector: React.FC<TagSelectorProps> = ({ selectedTags, onChange, availableTags }) => {
  const [inputValue, setInputValue] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [wrapperRef]);

  const handleAddTag = (tag: string) => {
    const trimmedTag = tag.trim();
    if (trimmedTag && !selectedTags.includes(trimmedTag)) {
      onChange([...selectedTags, trimmedTag]);
    }
    setInputValue('');
    setIsDropdownOpen(false);
  };

  const handleRemoveTag = (tagToRemove: string) => {
    onChange(selectedTags.filter(tag => tag !== tagToRemove));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTag(inputValue);
    } else if (e.key === 'Backspace' && !inputValue && selectedTags.length > 0) {
      // Remove last tag if input is empty
      handleRemoveTag(selectedTags[selectedTags.length - 1]);
    }
  };

  const filteredTags = availableTags.filter(
    tag => 
      tag.toLowerCase().includes(inputValue.toLowerCase()) && 
      !selectedTags.includes(tag)
  );

  return (
    <div className={styles.container} ref={wrapperRef}>
      <label className={styles.label}>Tags</label>
      <div 
        className={styles.inputWrapper}
        onClick={() => setIsDropdownOpen(true)}
      >
        {selectedTags.map(tag => (
          <span key={tag} className={styles.tag}>
            {tag}
            <button 
              type="button"
              onClick={(e) => { e.stopPropagation(); handleRemoveTag(tag); }}
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
          placeholder={selectedTags.length === 0 ? "Add tags..." : ""}
          className={styles.input}
        />
      </div>

      {isDropdownOpen && (inputValue || filteredTags.length > 0) && (
        <div className={styles.dropdown}>
          {filteredTags.map(tag => (
            <button
              key={tag}
              type="button"
              onClick={() => handleAddTag(tag)}
              className={styles.option}
            >
              <span>{tag}</span>
            </button>
          ))}
          {inputValue && !filteredTags.includes(inputValue) && !selectedTags.includes(inputValue) && (
            <button
                type="button"
                onClick={() => handleAddTag(inputValue)}
                className={styles.createOption}
            >
                Create &quot;{inputValue}&quot;
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default TagSelector;
