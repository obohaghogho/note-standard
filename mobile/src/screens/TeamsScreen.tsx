import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Image
} from 'react-native';
import { TeamsService, Team } from '../services/TeamsService';

export default function TeamsScreen() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const data = await TeamsService.getMyTeams();
    setTeams(data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const renderTeam = ({ item }: { item: Team }) => (
    <TouchableOpacity style={styles.card} activeOpacity={0.7}>
      <View style={styles.avatarWrap}>
        {item.avatar_url ? (
          <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarText}>{item.name.charAt(0).toUpperCase()}</Text>
          </View>
        )}
      </View>
      <View style={styles.info}>
        <Text style={styles.name}>{item.name}</Text>
        <Text style={styles.role}>{item.my_role.toUpperCase()}</Text>
        <Text style={styles.desc} numberOfLines={1}>{item.description || 'No description'}</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#f59e0b" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Teams</Text>
        <TouchableOpacity style={styles.addBtn}>
          <Text style={styles.addBtnText}>+ Create</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={teams}
        keyExtractor={i => i.id}
        renderItem={renderTeam}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#f59e0b" />}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>👥</Text>
            <Text style={styles.emptyTitle}>No teams yet</Text>
            <Text style={styles.emptySub}>Create a team on the web to start collaborating</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#060611' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#060611' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16, borderBottomWidth: 1, borderColor: '#111133' },
  title: { color: '#fff', fontSize: 26, fontWeight: '800' },
  addBtn: { backgroundColor: '#f59e0b', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12 },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  list: { padding: 16 },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0d0d1e', borderRadius: 18, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#111133' },
  avatarWrap: { marginRight: 16 },
  avatar: { width: 52, height: 52, borderRadius: 16 },
  avatarPlaceholder: { width: 52, height: 52, borderRadius: 16, backgroundColor: '#f59e0b22', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#f59e0b44' },
  avatarText: { color: '#f59e0b', fontSize: 20, fontWeight: '800' },
  info: { flex: 1 },
  name: { color: '#fff', fontSize: 16, fontWeight: '700' },
  role: { color: '#f59e0b', fontSize: 10, fontWeight: '800', marginTop: 2 },
  desc: { color: '#666', fontSize: 12, marginTop: 4 },
  chevron: { color: '#333', fontSize: 24, marginLeft: 8 },
  empty: { alignItems: 'center', paddingTop: 80 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  emptySub: { color: '#666', fontSize: 14, marginTop: 6, textAlign: 'center', paddingHorizontal: 32 },
});
