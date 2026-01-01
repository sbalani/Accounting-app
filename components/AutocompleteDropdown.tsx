"use client";

import { useState, useEffect, useRef } from "react";

interface Item {
  id: string;
  name: string;
  color?: string;
  is_default?: boolean;
}

interface AutocompleteDropdownProps {
  items: Item[];
  value: string | null;
  onChange: (itemId: string | null, itemName: string | null) => void;
  onCreateNew?: (name: string) => Promise<Item | null>;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export default function AutocompleteDropdown({
  items,
  value,
  onChange,
  onCreateNew,
  placeholder = "Type to search...",
  className = "",
  disabled = false,
}: AutocompleteDropdownProps) {
  const [inputValue, setInputValue] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [filteredItems, setFilteredItems] = useState<Item[]>(items);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Find the selected item by ID
  const selectedItem = items.find((item) => item.id === value);

  // Update input value when selected item changes
  useEffect(() => {
    if (selectedItem) {
      setInputValue(selectedItem.name);
    } else if (!value) {
      setInputValue("");
    }
  }, [selectedItem, value]);

  // Filter items based on input
  useEffect(() => {
    if (!inputValue.trim()) {
      setFilteredItems(items);
    } else {
      const filtered = items.filter((item) =>
        item.name.toLowerCase().includes(inputValue.toLowerCase())
      );
      setFilteredItems(filtered);
    }
    setHighlightedIndex(-1);
  }, [inputValue, items]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    setIsOpen(true);
  };

  const handleSelectItem = (item: Item) => {
    setInputValue(item.name);
    onChange(item.id, item.name);
    setIsOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIsOpen(true);
      setHighlightedIndex((prev) =>
        prev < filteredItems.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlightedIndex >= 0 && filteredItems[highlightedIndex]) {
        handleSelectItem(filteredItems[highlightedIndex]);
      } else if (inputValue.trim() && onCreateNew) {
        handleCreateNew();
      }
    } else if (e.key === "Escape") {
      setIsOpen(false);
      setHighlightedIndex(-1);
    }
  };

  const handleCreateNew = async () => {
    if (!onCreateNew || !inputValue.trim()) return;

    const newItem = await onCreateNew(inputValue.trim());
    if (newItem) {
      handleSelectItem(newItem);
    }
  };

  const handleInputFocus = () => {
    setIsOpen(true);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    setInputValue("");
    onChange(null, null);
    setIsOpen(false);
    inputRef.current?.focus();
  };

  const showCreateOption =
    isOpen &&
    inputValue.trim() &&
    onCreateNew &&
    !filteredItems.some(
      (item) => item.name.toLowerCase() === inputValue.toLowerCase()
    );

  return (
    <div className={`relative ${className}`}>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={handleInputFocus}
          placeholder={placeholder}
          disabled={disabled}
          className="block w-full px-3 py-2 border border-gray-300 bg-white text-gray-900 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm disabled:bg-gray-100 disabled:cursor-not-allowed"
        />
        {value && !disabled && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        )}
      </div>

      {isOpen && (filteredItems.length > 0 || showCreateOption) && (
        <div
          ref={dropdownRef}
          className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto"
        >
          {filteredItems.map((item, index) => (
            <div
              key={item.id}
              onClick={() => handleSelectItem(item)}
              onMouseEnter={() => setHighlightedIndex(index)}
              className={`px-3 py-2 cursor-pointer hover:bg-blue-50 ${
                highlightedIndex === index ? "bg-blue-50" : ""
              } ${value === item.id ? "bg-blue-100" : ""}`}
            >
              <div className="flex items-center gap-2">
                {item.color && (
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: item.color }}
                  />
                )}
                <span className="text-sm text-gray-900">{item.name}</span>
                {item.is_default && (
                  <span className="ml-auto text-xs text-gray-500">Default</span>
                )}
              </div>
            </div>
          ))}
          {showCreateOption && (
            <div
              onClick={handleCreateNew}
              onMouseEnter={() => setHighlightedIndex(-2)}
              className={`px-3 py-2 cursor-pointer hover:bg-green-50 border-t border-gray-200 ${
                highlightedIndex === -2 ? "bg-green-50" : ""
              }`}
            >
              <div className="flex items-center gap-2">
                <svg
                  className="w-4 h-4 text-green-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4v16m8-8H4"
                  />
                </svg>
                <span className="text-sm text-green-700">
                  Create "{inputValue.trim()}"
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

