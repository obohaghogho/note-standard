import React, { useMemo } from 'react';
import { Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import type { Wallet } from '@/types/wallet';
import { formatCurrency } from '../../lib/CurrencyFormatter';

ChartJS.register(ArcElement, Tooltip, Legend);

interface WalletAllocationChartProps {
    wallets: Wallet[];
    rates: Record<string, number>;
}

export const WalletAllocationChart: React.FC<WalletAllocationChartProps> = ({ wallets, rates }) => {
    
    const data = useMemo(() => {
        const labels: string[] = [];
        const dataPoints: number[] = [];
        const backgroundColors: string[] = [];
        const borderColors: string[] = [];

        // Sort wallets by value (highest first)
        const sortedWallets = [...wallets].sort((a, b) => {
            const valA = a.balance * (rates[a.currency] || 0);
            const valB = b.balance * (rates[b.currency] || 0);
            return valB - valA;
        });

        const colorPalette = [
            '#8b5cf6', // purple-500
            '#3b82f6', // blue-500
            '#10b981', // emerald-500
            '#f59e0b', // amber-500
            '#ef4444', // red-500
            '#ec4899', // pink-500
            '#6366f1', // indigo-500
            '#14b8a6', // teal-500
        ];

        sortedWallets.forEach((wallet, index) => {
            const usdValue = wallet.balance * (rates[wallet.currency] || 0);
            if (usdValue > 0.01) { // Only show significant balances
                labels.push(wallet.currency);
                dataPoints.push(usdValue);
                backgroundColors.push(colorPalette[index % colorPalette.length]);
                borderColors.push('#111827'); // gray-900 border for separation
            }
        });

        // If no data, show placeholder
        if (dataPoints.length === 0) {
             return {
                labels: ['Empty'],
                datasets: [{
                    data: [1],
                    backgroundColor: ['#374151'], // gray-700
                    borderWidth: 0,
                }]
            };
        }

        return {
            labels,
            datasets: [
                {
                    data: dataPoints,
                    backgroundColor: backgroundColors,
                    borderColor: borderColors,
                    borderWidth: 2,
                    hoverOffset: 4
                },
            ],
        };
    }, [wallets, rates]);

    const options = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: 'bottom' as const,
                labels: {
                    color: '#9ca3af', // gray-400
                    font: {
                        family: "'Inter', sans-serif",
                        size: 11
                    },
                    padding: 20,
                    usePointStyle: true,
                    boxWidth: 8
                }
            },
            tooltip: {
                backgroundColor: 'rgba(17, 24, 39, 0.9)', // gray-900
                titleColor: '#fff',
                bodyColor: '#e5e7eb', // gray-200
                padding: 12,
                cornerRadius: 8,
                callbacks: {
                    label: function(context: any) {
                        let label = context.label || '';
                        if (label) {
                            label += ': ';
                        }
                        if (context.parsed !== null) {
                            label += formatCurrency(context.parsed, 'USD');
                        }
                        return label;
                    }
                }
            }
        },
        cutout: '70%', // Thinner doughnut
    };

    return (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-lg flex flex-col items-center">
            <h3 className="text-gray-300 font-bold mb-6 w-full text-left flex items-center gap-2">
                Portfolio Allocation
                <span className="text-xs font-normal text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full">USD Value</span>
            </h3>
            
            <div className="h-48 w-full relative">
                 {wallets.length === 0 || Object.keys(rates).length === 0 ? (
                    <div className="absolute inset-0 flex items-center justify-center text-gray-500 text-sm">
                        No Data
                    </div>
                 ) : null}
                <Doughnut data={data} options={options} />
                
                {data.datasets[0].data.length > 0 && data.labels[0] !== 'Empty' && (
                     <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="text-center">
                            <p className="text-xs text-gray-500">Total Assets</p>
                            <p className="text-sm font-bold text-white">{wallets.length}</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
