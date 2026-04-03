import React from 'react';
import dealerImg from '../../assets/table/dealer.png';
import styles from '../../styles/table.module.css';

interface Props {
  buttonSeatIndex: number;
}

const BTN_CLASSES = [styles.btn0, styles.btn1, styles.btn2, styles.btn3, styles.btn4, styles.btn5];

export const DealerButton: React.FC<Props> = React.memo(({ buttonSeatIndex }) => {
  const posClass = BTN_CLASSES[buttonSeatIndex] ?? BTN_CLASSES[0];

  return (
    <img
      className={`${styles.dealerButton} ${posClass}`}
      src={dealerImg}
      alt="Dealer"
      draggable={false}
    />
  );
});
