import { useState } from 'react';
import { Button, TextInput, View } from 'react-native';

export default function HomeScreen() {
  const [prompt, setPrompt] = useState('');

  const handlePress = () => {};

  return (
    <View style={{ padding: 20 }}>
      <TextInput
        value={prompt}
        onChangeText={setPrompt}
        placeholder="GPT에게 물어보세요"
        style={{ borderWidth: 1, padding: 10, marginBottom: 20 }}
      />
      <Button title="보내기" onPress={handlePress} />
    </View>
  );
}
